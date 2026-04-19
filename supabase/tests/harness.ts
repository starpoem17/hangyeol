import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { ModerationDecision } from "../../src/features/concerns/server/moderation";
import type {
  PersistApprovedConcernInput,
  SubmitConcernServiceDependencies,
} from "../../src/features/concerns/server/submit-concern-service";
import { completeOnboarding } from "../../src/features/onboarding/api";
import type { GenderKey, InterestKey } from "../../src/features/onboarding/constants";
import type {
  PersistResponseSubmissionResult,
  SubmitResponseServiceDependencies,
} from "../../src/features/responses/server/submit-response-service";
import { fetchOwnProfileWithRetry } from "../../src/features/session/bootstrap";
import type {
  SaveFeedbackRpcRow,
  SaveResponseFeedbackHandlerDeps,
} from "../functions/save-response-feedback/handler";

export type LocalSupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export type InsertedConcernRow = {
  id: string;
  source_type: "real" | "example";
  author_profile_id: string | null;
  example_key: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type InsertedDeliveryRow = {
  id: string;
  concern_id: string;
  recipient_profile_id: string;
  status: "assigned" | "opened" | "responded";
  delivered_at: string;
  opened_at: string | null;
  responded_at: string | null;
  routing_order: number;
};

export type InsertedResponseRow = {
  id: string;
  delivery_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type InsertedFeedbackRow = {
  id: string;
  response_id: string;
  concern_author_profile_id: string;
  liked: boolean;
  comment_body: string | null;
  created_at: string;
  updated_at: string;
};

export type InsertedNotificationRow = {
  id: string;
  profile_id: string;
  type: "concern_delivered" | "response_received" | "response_liked" | "response_commented";
  related_entity_type: "concern" | "concern_delivery" | "response" | "response_feedback";
  related_entity_id: string;
  read_at: string | null;
  created_at: string;
};

export type InsertedPushTokenRow = {
  id: string;
  profile_id: string;
  expo_push_token: string;
  platform: "ios" | "android";
  created_at: string;
  updated_at: string;
};

export type AuditRow = {
  id: string;
  subject_type: "concern" | "response" | "response_feedback_comment";
  actor_profile_id: string | null;
  raw_submitted_text: string;
  blocked: boolean;
  category_summary: Record<string, unknown>;
  raw_provider_payload: Record<string, unknown>;
  checked_at: string;
  approved_entity_type: "concern" | "response" | "response_feedback" | null;
  approved_entity_id: string | null;
};

export type OnboardedUser = {
  client: SupabaseClient;
  user: User;
  session: Session;
  profile: {
    id: string;
    gender: "male" | "female" | null;
    onboardingCompleted: boolean;
  };
  interestKeys: string[];
};

type NotificationRelatedEntityType = InsertedNotificationRow["related_entity_type"];
type NotificationType = InsertedNotificationRow["type"];
type PushPlatform = InsertedPushTokenRow["platform"];
type DeliveryStatus = InsertedDeliveryRow["status"];

let cachedEnv: LocalSupabaseEnv | null = null;

export function hasPhase11EnvConfigured() {
  return Boolean(
    process.env.PHASE11_SUPABASE_URL &&
      process.env.PHASE11_SUPABASE_ANON_KEY &&
      process.env.PHASE11_SUPABASE_SERVICE_ROLE_KEY,
  );
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Phase 11 tests`);
  }

  return value;
}

function createUniqueValue(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createNotificationReadTimestamp() {
  return new Date().toISOString();
}

function assertNoError<T>(error: { message: string } | null, context: string, data?: T) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  return data;
}

function buildResponseSubmissionResult(data: unknown): PersistResponseSubmissionResult {
  const rows = Array.isArray(data) ? data : [data];
  const firstRow = rows[0];

  if (
    !firstRow ||
    typeof firstRow !== "object" ||
    !("result_code" in firstRow) ||
    typeof firstRow.result_code !== "string" ||
    !("notification_created" in firstRow) ||
    typeof firstRow.notification_created !== "boolean"
  ) {
    throw new Error("submit_response_with_notifications_and_moderation_audit returned an invalid result");
  }

  const resultRow = firstRow as {
    response_id?: string | null;
    result_code: PersistResponseSubmissionResult["resultCode"];
    notification_created: boolean;
    concern_source_type?: PersistResponseSubmissionResult["concernSourceType"];
  };

  const notifications = rows.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const notificationRow = row as {
      notification_id?: string | null;
      notification_profile_id?: string | null;
      notification_type?: NotificationType | null;
      notification_related_entity_type?: NotificationRelatedEntityType | null;
      notification_related_entity_id?: string | null;
    };

    if (
      typeof notificationRow.notification_id !== "string" ||
      typeof notificationRow.notification_profile_id !== "string" ||
      typeof notificationRow.notification_type !== "string" ||
      typeof notificationRow.notification_related_entity_type !== "string" ||
      typeof notificationRow.notification_related_entity_id !== "string"
    ) {
      return [];
    }

    return [
      {
        id: notificationRow.notification_id,
        profileId: notificationRow.notification_profile_id,
        type: notificationRow.notification_type,
        relatedEntityType: notificationRow.notification_related_entity_type,
        relatedEntityId: notificationRow.notification_related_entity_id,
      },
    ];
  });

  return {
    responseId: typeof resultRow.response_id === "string" ? resultRow.response_id : null,
    resultCode: resultRow.result_code,
    notificationCreated: resultRow.notification_created,
    concernSourceType:
      resultRow.concern_source_type === "real" || resultRow.concern_source_type === "example"
        ? resultRow.concern_source_type
        : null,
    notifications,
  };
}

function buildConcernPersistencePayload(input: {
  actorProfileId: string;
  rawSubmittedText: string;
  validatedBody: string | null;
  moderation: ModerationDecision;
}) {
  return {
    p_actor_profile_id: input.actorProfileId,
    p_raw_submitted_text: input.rawSubmittedText,
    p_validated_body: input.validatedBody,
    p_blocked: input.moderation.blocked,
    p_category_summary: input.moderation.categorySummary,
    p_raw_provider_payload: input.moderation.rawProviderPayload,
  };
}

export function loadLocalSupabaseEnv(): LocalSupabaseEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = {
    url: requireEnv("PHASE11_SUPABASE_URL"),
    anonKey: requireEnv("PHASE11_SUPABASE_ANON_KEY"),
    serviceRoleKey: requireEnv("PHASE11_SUPABASE_SERVICE_ROLE_KEY"),
  };

  return cachedEnv;
}

export function createAnonClient() {
  const env = loadLocalSupabaseEnv();

  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createServiceClient() {
  const env = loadLocalSupabaseEnv();

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createModerationDecision(overrides: Partial<ModerationDecision> = {}): ModerationDecision {
  return {
    blocked: false,
    categorySummary: {
      flagged_categories: [],
    },
    rawProviderPayload: {
      provider: "phase11-test",
      id: createUniqueValue("moderation"),
    },
    ...overrides,
  };
}

export async function signInAnonymousUser() {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInAnonymously();

  assertNoError(error, "anonymous sign-in failed");

  if (!data.user || !data.session) {
    throw new Error("anonymous sign-in did not return a user session");
  }

  return {
    client,
    user: data.user,
    session: data.session,
  };
}

export async function fetchBootstrappedProfile(client: SupabaseClient, session: Session) {
  const result = await fetchOwnProfileWithRetry({
    supabase: client,
    session,
    isCurrent: () => true,
    delaysMs: [0, 100, 250, 500],
  });

  if (result.kind !== "success") {
    throw new Error(`profile bootstrap failed with kind=${result.kind}`);
  }

  return result.profile;
}

export async function completeUserOnboarding(
  client: SupabaseClient,
  input: { gender: GenderKey; interestKeys: InterestKey[] | string[] },
) {
  await completeOnboarding(client, input);
}

export async function createOnboardedUser(input?: {
  gender?: GenderKey;
  interestKeys?: InterestKey[] | string[];
}): Promise<OnboardedUser> {
  const signedIn = await signInAnonymousUser();
  await fetchBootstrappedProfile(signedIn.client, signedIn.session);

  const interestKeys = [...(input?.interestKeys ?? ["study", "career_path"])];
  await completeUserOnboarding(signedIn.client, {
    gender: input?.gender ?? "female",
    interestKeys,
  });

  const profile = await fetchBootstrappedProfile(signedIn.client, signedIn.session);

  return {
    ...signedIn,
    profile,
    interestKeys,
  };
}

export async function insertRealConcern(
  serviceClient: SupabaseClient,
  input: {
    authorProfileId: string;
    body?: string;
  },
) {
  const { data, error } = await serviceClient
    .from("concerns")
    .insert({
      source_type: "real",
      author_profile_id: input.authorProfileId,
      body: input.body ?? createUniqueValue("real-concern-body"),
    })
    .select("id, source_type, author_profile_id, example_key, body, created_at, updated_at")
    .single();

  return assertNoError(error, "insert real concern failed", data) as InsertedConcernRow;
}

export async function insertExampleConcern(
  serviceClient: SupabaseClient,
  input?: {
    body?: string;
    exampleKey?: string;
  },
) {
  const { data, error } = await serviceClient
    .from("concerns")
    .insert({
      source_type: "example",
      example_key: input?.exampleKey ?? createUniqueValue("example-concern"),
      body: input?.body ?? createUniqueValue("example-concern-body"),
    })
    .select("id, source_type, author_profile_id, example_key, body, created_at, updated_at")
    .single();

  return assertNoError(error, "insert example concern failed", data) as InsertedConcernRow;
}

export async function insertDelivery(
  serviceClient: SupabaseClient,
  input: {
    concernId: string;
    recipientProfileId: string;
    status?: DeliveryStatus;
    routingOrder?: number;
  },
) {
  const status = input.status ?? "assigned";
  const deliveredAt = createNotificationReadTimestamp();
  const openedAt = status === "opened" || status === "responded" ? deliveredAt : null;
  const respondedAt = status === "responded" ? deliveredAt : null;

  const { data, error } = await serviceClient
    .from("concern_deliveries")
    .insert({
      concern_id: input.concernId,
      recipient_profile_id: input.recipientProfileId,
      status,
      delivered_at: deliveredAt,
      opened_at: openedAt,
      responded_at: respondedAt,
      routing_order: input.routingOrder ?? 1,
    })
    .select("id, concern_id, recipient_profile_id, status, delivered_at, opened_at, responded_at, routing_order")
    .single();

  return assertNoError(error, "insert delivery failed", data) as InsertedDeliveryRow;
}

export async function insertResponse(
  serviceClient: SupabaseClient,
  input: {
    deliveryId: string;
    body?: string;
  },
) {
  const { data, error } = await serviceClient
    .from("responses")
    .insert({
      delivery_id: input.deliveryId,
      body: input.body ?? createUniqueValue("response-body"),
    })
    .select("id, delivery_id, body, created_at, updated_at")
    .single();

  return assertNoError(error, "insert response failed", data) as InsertedResponseRow;
}

export async function insertNotification(
  serviceClient: SupabaseClient,
  input: {
    profileId: string;
    type?: NotificationType;
    relatedEntityType?: NotificationRelatedEntityType;
    relatedEntityId: string;
    readAt?: string | null;
  },
) {
  const { data, error } = await serviceClient
    .from("notifications")
    .insert({
      profile_id: input.profileId,
      type: input.type ?? "concern_delivered",
      related_entity_type: input.relatedEntityType ?? "concern_delivery",
      related_entity_id: input.relatedEntityId,
      read_at: input.readAt ?? null,
    })
    .select("id, profile_id, type, related_entity_type, related_entity_id, read_at, created_at")
    .single();

  return assertNoError(error, "insert notification failed", data) as InsertedNotificationRow;
}

export async function insertPushToken(
  serviceClient: SupabaseClient,
  input: {
    profileId: string;
    platform?: PushPlatform;
    expoPushToken?: string;
  },
) {
  const { data, error } = await serviceClient
    .from("push_tokens")
    .insert({
      profile_id: input.profileId,
      platform: input.platform ?? "ios",
      expo_push_token: input.expoPushToken ?? createUniqueValue("ExponentPushToken"),
    })
    .select("id, profile_id, expo_push_token, platform, created_at, updated_at")
    .single();

  return assertNoError(error, "insert push token failed", data) as InsertedPushTokenRow;
}

export async function listAuditRowsBySubject(
  serviceClient: SupabaseClient,
  input: {
    subjectType: AuditRow["subject_type"];
    actorProfileId?: string;
    rawSubmittedText?: string;
    approvedEntityType?: AuditRow["approved_entity_type"];
    approvedEntityId?: string;
  },
) {
  const { data, error } = await serviceClient.rpc("list_moderation_audit_entries_for_operator", {
    p_limit: 200,
    p_subject_type: input.subjectType,
    p_blocked: null,
  });

  const rows = assertNoError(error, "list moderation audit rows failed", data ?? []) as AuditRow[];

  return rows
    .filter((row) => !input.actorProfileId || row.actor_profile_id === input.actorProfileId)
    .filter((row) => typeof input.rawSubmittedText !== "string" || row.raw_submitted_text === input.rawSubmittedText)
    .filter((row) => input.approvedEntityType === undefined || row.approved_entity_type === input.approvedEntityType)
    .filter((row) => input.approvedEntityId === undefined || row.approved_entity_id === input.approvedEntityId);
}

export async function getConcernById(serviceClient: SupabaseClient, concernId: string) {
  const { data, error } = await serviceClient
    .from("concerns")
    .select("id, source_type, author_profile_id, example_key, body, created_at, updated_at")
    .eq("id", concernId)
    .maybeSingle();

  return assertNoError(error, "get concern by id failed", data ?? null) as InsertedConcernRow | null;
}

export async function getResponseByDeliveryId(serviceClient: SupabaseClient, deliveryId: string) {
  const { data, error } = await serviceClient
    .from("responses")
    .select("id, delivery_id, body, created_at, updated_at")
    .eq("delivery_id", deliveryId)
    .maybeSingle();

  return assertNoError(error, "get response by delivery id failed", data ?? null) as InsertedResponseRow | null;
}

export async function getFeedbackByResponseId(
  serviceClient: SupabaseClient,
  responseId: string,
  concernAuthorProfileId?: string,
) {
  let query = serviceClient
    .from("response_feedback")
    .select("id, response_id, concern_author_profile_id, liked, comment_body, created_at, updated_at")
    .eq("response_id", responseId);

  if (concernAuthorProfileId) {
    query = query.eq("concern_author_profile_id", concernAuthorProfileId);
  }

  const { data, error } = await query.maybeSingle();

  return assertNoError(error, "get feedback by response id failed", data ?? null) as InsertedFeedbackRow | null;
}

export async function listNotificationsByProfileId(serviceClient: SupabaseClient, profileId: string) {
  const { data, error } = await serviceClient
    .from("notifications")
    .select("id, profile_id, type, related_entity_type, related_entity_id, read_at, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return assertNoError(error, "list notifications by profile id failed", data ?? []) as InsertedNotificationRow[];
}

export async function listDeliveriesByConcernId(serviceClient: SupabaseClient, concernId: string) {
  const { data, error } = await serviceClient
    .from("concern_deliveries")
    .select("id, concern_id, recipient_profile_id, status, delivered_at, opened_at, responded_at, routing_order")
    .eq("concern_id", concernId)
    .order("routing_order", { ascending: true });

  return assertNoError(error, "list deliveries by concern id failed", data ?? []) as InsertedDeliveryRow[];
}

export async function listProfileInterestKeys(serviceClient: SupabaseClient, profileId: string) {
  const { data, error } = await serviceClient
    .from("profile_interests")
    .select("interest_key")
    .eq("profile_id", profileId)
    .order("interest_key", { ascending: true });

  assertNoError(error, "list profile interests failed");
  return (data ?? []).map((row) => row.interest_key as string);
}

export async function getProfileById(serviceClient: SupabaseClient, profileId: string) {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id, gender, onboarding_completed, is_active, is_blocked")
    .eq("id", profileId)
    .maybeSingle();

  return assertNoError(error, "get profile by id failed", data ?? null) as {
    id: string;
    gender: "male" | "female" | null;
    onboarding_completed: boolean;
    is_active: boolean;
    is_blocked: boolean;
  } | null;
}

export function buildSubmitConcernDeps(
  serviceClient: SupabaseClient,
  options?: {
    moderationDecision?: ModerationDecision;
    responderProfileIds?: string[];
  },
): SubmitConcernServiceDependencies {
  return {
    async resolveProfileId(authUserId) {
      const { data, error } = await serviceClient.from("profiles").select("id").eq("id", authUserId).maybeSingle();

      assertNoError(error, "resolve profile id failed");
      return data?.id ?? null;
    },
    async moderateConcernBody() {
      return options?.moderationDecision ?? createModerationDecision();
    },
    async persistBlockedConcernSubmission(input) {
      const { error } = await serviceClient.rpc(
        "submit_concern_with_moderation_audit",
        buildConcernPersistencePayload({
          actorProfileId: input.actorProfileId,
          rawSubmittedText: input.rawSubmittedText,
          validatedBody: null,
          moderation: input.moderation,
        }),
      );

      assertNoError(error, "persist blocked concern failed");
    },
    async persistApprovedConcernSubmission(input: PersistApprovedConcernInput) {
      const { data, error } = await serviceClient.rpc("submit_approved_concern_with_routing_and_notifications", {
        p_actor_profile_id: input.actorProfileId,
        p_raw_submitted_text: input.rawSubmittedText,
        p_validated_body: input.validatedBody,
        p_category_summary: input.moderation.categorySummary,
        p_raw_provider_payload: input.moderation.rawProviderPayload,
        p_recipient_profile_ids: input.responderProfileIds,
      });

      assertNoError(error, "persist approved concern failed");

      const rows = Array.isArray(data) ? data : [];
      const concernId = rows[0]?.concern_id;

      if (typeof concernId !== "string") {
        throw new Error("approved concern persistence did not return a concern id");
      }

      return { concernId };
    },
    async selectResponderProfileIds() {
      return [...(options?.responderProfileIds ?? [])];
    },
  };
}

export function buildSubmitResponseDeps(
  serviceClient: SupabaseClient,
  options?: {
    moderationDecision?: ModerationDecision;
  },
): SubmitResponseServiceDependencies {
  return {
    async resolveProfileId(authUserId) {
      const { data, error } = await serviceClient.from("profiles").select("id").eq("id", authUserId).maybeSingle();

      assertNoError(error, "resolve response profile id failed");
      return data?.id ?? null;
    },
    async moderateResponseBody() {
      return options?.moderationDecision ?? createModerationDecision();
    },
    async persistResponseSubmission(input) {
      const { data, error } = await serviceClient.rpc("submit_response_with_notifications_and_moderation_audit", {
        p_actor_profile_id: input.actorProfileId,
        p_delivery_id: input.deliveryId,
        p_raw_submitted_text: input.rawSubmittedText,
        p_validated_body: input.validatedBody,
        p_blocked: input.moderation.blocked,
        p_category_summary: input.moderation.categorySummary,
        p_raw_provider_payload: input.moderation.rawProviderPayload,
      });

      assertNoError(error, "persist response submission failed");
      return buildResponseSubmissionResult(data);
    },
  };
}

export function buildSaveFeedbackHandlerDeps(
  serviceClient: SupabaseClient,
  options: {
    authUserId: string;
    moderationDecision?: ModerationDecision;
  },
): SaveResponseFeedbackHandlerDeps {
  return {
    async requireAuthenticatedUserId() {
      return options.authUserId;
    },
    async loadProfileId(authUserId) {
      const { data, error } = await serviceClient.from("profiles").select("id").eq("id", authUserId).maybeSingle();

      assertNoError(error, "load feedback profile id failed");
      return data?.id ?? null;
    },
    async saveFeedback(args) {
      const moderation = options.moderationDecision ?? createModerationDecision();
      const { data, error } = await serviceClient.rpc("save_response_feedback_with_notifications", {
        p_actor_profile_id: args.actorProfileId,
        p_response_id: args.responseId,
        p_liked: args.liked,
        p_comment_body: args.commentBody,
        p_blocked: moderation.blocked,
        p_category_summary: moderation.categorySummary,
        p_raw_provider_payload: moderation.rawProviderPayload,
      });

      return assertNoError(error, "save feedback rpc failed", data) as SaveFeedbackRpcRow[];
    },
    async sendNotificationPushes() {
      return {
        requestedNotificationCount: 0,
        resolvedTokenCount: 0,
        dispatchedMessageCount: 0,
        successCount: 0,
        failureCount: 0,
        deletedTokenCount: 0,
        skippedReason: "phase11_test_noop",
      };
    },
    logEvent() {},
    logError() {},
  };
}
