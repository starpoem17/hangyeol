import { createClient } from "npm:@supabase/supabase-js@2.56.1";

import {
  AUTH_REQUIRED_MESSAGE,
  INVALID_JSON_MESSAGE,
  SUBMIT_CONCERN_RETRY_MESSAGE,
  type SubmitConcernErrorResponse,
} from "../../../src/features/concerns/contracts.ts";
import { normalizeModerationResponse } from "../../../src/features/concerns/server/moderation.ts";
import { submitConcernWithDependencies } from "../../../src/features/concerns/server/submit-concern-service.ts";
import {
  buildRoutingOpenAiInput,
  computeRequiredDeliveryCount,
  filterEligibleRoutingCandidates,
  isConcernAuthorRoutable,
} from "../../../src/features/routing/server/eligibility.ts";
import { selectRespondersWithOpenAi } from "../../../src/features/routing/server/openai-routing.ts";
import { loadDraftConcernRoutingState } from "../../../src/features/routing/server/runtime-state.ts";
import type { NotificationRelatedEntityType, NotificationType } from "../../../src/features/notifications/types.ts";
import { logEvent, logEventError } from "../_shared/event-log.ts";
import { sendNotificationPushes } from "../_shared/expo-push.ts";

type JsonHeaders = Record<string, string>;
type ServiceClient = ReturnType<typeof createServiceClient>;
type DeliveryNotificationRow = {
  concern_id: string;
  delivery_id: string;
  recipient_profile_id: string;
  routing_order: number;
  notification_id: string;
  notification_profile_id: string;
  notification_type: NotificationType;
  notification_related_entity_type: NotificationRelatedEntityType;
  notification_related_entity_id: string;
};

type ModerationRpcPayload = {
  p_actor_profile_id: string;
  p_raw_submitted_text: string;
  p_validated_body: string | null;
  p_blocked: boolean;
  p_category_summary: Record<string, unknown>;
  p_raw_provider_payload: unknown;
};

const jsonHeaders: JsonHeaders = {
  "Content-Type": "application/json",
};

const corsHeaders: JsonHeaders = {
  ...jsonHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function jsonResponse(status: number, body: unknown, headers: JsonHeaders = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function createUserClient(request: Request) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization");

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authorization
        ? {
            Authorization: authorization,
          }
        : {},
    },
  });
}

function createServiceClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const userClient = createUserClient(request);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}

function buildPersistencePayload(base: {
  actorProfileId: string;
  rawSubmittedText: string;
  blocked: boolean;
  validatedBody: string | null;
  categorySummary: Record<string, unknown>;
  rawProviderPayload: unknown;
}): ModerationRpcPayload {
  return {
    p_actor_profile_id: base.actorProfileId,
    p_raw_submitted_text: base.rawSubmittedText,
    p_validated_body: base.validatedBody,
    p_blocked: base.blocked,
    p_category_summary: base.categorySummary,
    p_raw_provider_payload: base.rawProviderPayload,
  };
}

async function moderateConcernBody(rawBody: string) {
  const openAiApiKey = getRequiredEnv("OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: rawBody,
    }),
  });

  if (!response.ok) {
    throw new Error(`moderation request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return normalizeModerationResponse(payload);
}

function buildServerErrorBody(): SubmitConcernErrorResponse {
  return {
    code: "concern_submission_failed",
    userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
  };
}

async function selectConcernResponderProfileIds(
  serviceClient: ServiceClient,
  input: {
    actorProfileId: string;
    concernBody: string;
  },
) {
  const routingState = await loadDraftConcernRoutingState(serviceClient, input.actorProfileId);

  if (!isConcernAuthorRoutable(routingState.author)) {
    throw new Error("routing concern author is not routable");
  }

  const eligibleCandidates = filterEligibleRoutingCandidates(routingState.candidatePool);
  const requiredDeliveryCount = computeRequiredDeliveryCount(eligibleCandidates.length);

  logEvent({
    event: "routing_eligible_pool_computed",
    authorProfileId: input.actorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
  });

  if (eligibleCandidates.length < requiredDeliveryCount) {
    logEventError({
      event: "routing_invariant_failed",
      authorProfileId: input.actorProfileId,
      eligibleCandidateCount: eligibleCandidates.length,
      requiredDeliveryCount,
      errorCode: "routing_invariant_allowable_pool_too_small",
    });
    throw new Error("routing invariant failure: allowable pool too small");
  }

  const openAiInput = buildRoutingOpenAiInput({
    author: routingState.author,
    concernBody: input.concernBody,
    eligibleCandidates,
    requiredDeliveryCount,
  });

  const selection = await selectRespondersWithOpenAi(openAiInput, {
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
  });

  if (!selection.ok) {
    logEventError({
      event: "routing_selection_failed",
      authorProfileId: input.actorProfileId,
      eligibleCandidateCount: eligibleCandidates.length,
      requiredDeliveryCount,
      errorCode: selection.code,
    });
    throw new Error(`routing selection failed: ${selection.code}`);
  }

  logEvent({
    event: "routing_selection_completed",
    authorProfileId: input.actorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
    responderProfileIds: selection.responderProfileIds,
  });

  return selection.responderProfileIds;
}

async function persistApprovedConcernSubmission(
  serviceClient: ServiceClient,
  input: {
    actorProfileId: string;
    rawSubmittedText: string;
    validatedBody: string;
    categorySummary: Record<string, unknown>;
    rawProviderPayload: unknown;
    responderProfileIds: string[];
  },
) {
  const { data, error } = await serviceClient.rpc("submit_approved_concern_with_routing_and_notifications", {
    p_actor_profile_id: input.actorProfileId,
    p_raw_submitted_text: input.rawSubmittedText,
    p_validated_body: input.validatedBody,
    p_category_summary: input.categorySummary,
    p_raw_provider_payload: input.rawProviderPayload,
    p_recipient_profile_ids: input.responderProfileIds,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DeliveryNotificationRow[];
  const concernId = rows[0]?.concern_id;

  if (typeof concernId !== "string" || concernId.length === 0) {
    throw new Error("approved concern persistence did not return a concern id");
  }

  return {
    concernId,
    notifications: rows,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  let authUserId: string | null;

  try {
    authUserId = await requireAuthenticatedUserId(request);
  } catch (error) {
    console.error("submit-concern auth failure", error);
    return jsonResponse(500, buildServerErrorBody());
  }

  if (!authUserId) {
    return jsonResponse(401, {
      code: "auth_required",
      userMessage: AUTH_REQUIRED_MESSAGE,
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, {
      code: "invalid_json",
      userMessage: INVALID_JSON_MESSAGE,
    });
  }

  try {
    const serviceClient = createServiceClient();
    let concernPushNotifications: DeliveryNotificationRow[] = [];

    logEvent({
      event: "concern_submit_attempted",
    });

    const result = await submitConcernWithDependencies(
      {
        authUserId,
        payload,
      },
      {
        resolveProfileId: async (resolvedAuthUserId) => {
          const { data, error } = await serviceClient
            .from("profiles")
            .select("id")
            .eq("id", resolvedAuthUserId)
            .maybeSingle();

          if (error) {
            throw error;
          }

          return data?.id ?? null;
        },
        moderateConcernBody,
        persistBlockedConcernSubmission: async ({ actorProfileId, rawSubmittedText, moderation }) => {
          const { error } = await serviceClient.rpc(
            "submit_concern_with_moderation_audit",
            buildPersistencePayload({
              actorProfileId,
              rawSubmittedText,
              blocked: true,
              validatedBody: null,
              categorySummary: moderation.categorySummary,
              rawProviderPayload: moderation.rawProviderPayload,
            }),
          );

          if (error) {
            throw error;
          }
        },
        selectResponderProfileIds: async ({ actorProfileId, concernBody }) => {
          return selectConcernResponderProfileIds(serviceClient, {
            actorProfileId,
            concernBody,
          });
        },
        persistApprovedConcernSubmission: async ({
          actorProfileId,
          rawSubmittedText,
          validatedBody,
          moderation,
          responderProfileIds,
        }) => {
          const persistenceResult = await persistApprovedConcernSubmission(serviceClient, {
            actorProfileId,
            rawSubmittedText,
            validatedBody,
            categorySummary: moderation.categorySummary,
            rawProviderPayload: moderation.rawProviderPayload,
            responderProfileIds,
          });

          concernPushNotifications = persistenceResult.notifications;

          return {
            concernId: persistenceResult.concernId,
          };
        },
      },
    );

    if (concernPushNotifications.length > 0) {
      try {
        const pushSummary = await sendNotificationPushes(
          serviceClient,
          concernPushNotifications.map((notification) => ({
            notificationId: notification.notification_id,
            profileId: notification.notification_profile_id,
            type: notification.notification_type,
            relatedEntityType: notification.notification_related_entity_type,
            relatedEntityId: notification.notification_related_entity_id,
          })),
        );

        logEvent({
          event: "concern_push_completed",
          concernId: concernPushNotifications[0]?.concern_id ?? null,
          ...pushSummary,
        });
      } catch (error) {
        logEventError({
          event: "concern_push_failed",
          concernId: concernPushNotifications[0]?.concern_id ?? null,
          errorMessage: error instanceof Error ? error.message : "unknown push failure",
        });
      }
    }

    logEvent({
      event: result.ok ? `concern_submit_${result.body.status}` : "concern_submit_rejected",
      resultCode: result.ok ? result.body.status : result.body.code,
    });

    return jsonResponse(result.httpStatus, result.body);
  } catch (error) {
    logEventError({
      event: "concern_submit_failed",
      errorMessage: error instanceof Error ? error.message : "unknown concern submission failure",
    });
    return jsonResponse(500, buildServerErrorBody());
  }
});
