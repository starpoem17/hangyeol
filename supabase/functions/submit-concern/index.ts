import { createClient } from "npm:@supabase/supabase-js@2.56.1";

import {
  AUTH_REQUIRED_MESSAGE,
  INVALID_JSON_MESSAGE,
  SUBMIT_CONCERN_RETRY_MESSAGE,
  type SubmitConcernErrorResponse,
} from "../../../src/features/concerns/contracts.ts";
import { normalizeModerationResponse } from "../../../src/features/concerns/server/moderation.ts";
import { submitConcernWithDependencies } from "../../../src/features/concerns/server/submit-concern-service.ts";
import { selectRespondersWithOpenAi } from "../../../src/features/routing/server/openai-routing.ts";
import { routeConcernWithDependencies } from "../../../src/features/routing/server/route-concern-service.ts";

type JsonHeaders = Record<string, string>;
type ServiceClient = ReturnType<typeof createServiceClient>;

type ModerationRpcPayload = {
  p_actor_profile_id: string;
  p_raw_submitted_text: string;
  p_validated_body: string | null;
  p_blocked: boolean;
  p_category_summary: Record<string, unknown>;
  p_raw_provider_payload: unknown;
};

type ConcernRow = {
  id: string;
  source_type: "real" | "example";
  author_profile_id: string | null;
  body: string;
};

type ProfileRow = {
  id: string;
  onboarding_completed: boolean;
  gender: string | null;
  is_active: boolean;
  is_blocked: boolean;
};

type InterestRow = {
  profile_id: string;
  interest_key: string;
};

type ConcernDeliveryRow = {
  id: string;
  recipient_profile_id: string;
};

type ResponseRow = {
  delivery_id: string;
  body: string;
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

function groupStringsByProfileId(rows: Array<{ profileId: string; value: string }>) {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const values = grouped.get(row.profileId) ?? [];
    values.push(row.value);
    grouped.set(row.profileId, values);
  }

  return grouped;
}

async function selectProfileInterests(serviceClient: ServiceClient, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await serviceClient
    .from("profile_interests")
    .select("profile_id, interest_key")
    .in("profile_id", profileIds)
    .order("interest_key", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return groupStringsByProfileId((data ?? []).map((row: InterestRow) => ({ profileId: row.profile_id, value: row.interest_key })));
}

async function selectCandidateConcernBodies(serviceClient: ServiceClient, candidateProfileIds: string[]) {
  if (candidateProfileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await serviceClient
    .from("concerns")
    .select("author_profile_id, body, created_at")
    .eq("source_type", "real")
    .in("author_profile_id", candidateProfileIds)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return groupStringsByProfileId(
    (data ?? [])
      .filter((row: { author_profile_id: string | null; body: string }) => typeof row.author_profile_id === "string")
      .map((row: { author_profile_id: string; body: string }) => ({
        profileId: row.author_profile_id,
        value: row.body,
      })),
  );
}

async function selectCandidateResponseBodies(serviceClient: ServiceClient, candidateProfileIds: string[]) {
  if (candidateProfileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data: deliveries, error: deliveriesError } = await serviceClient
    .from("concern_deliveries")
    .select("id, recipient_profile_id")
    .in("recipient_profile_id", candidateProfileIds);

  if (deliveriesError) {
    throw deliveriesError;
  }

  const deliveryRows = (deliveries ?? []) as ConcernDeliveryRow[];

  if (deliveryRows.length === 0) {
    return new Map<string, string[]>();
  }

  const deliveryIdToRecipientId = new Map(deliveryRows.map((row) => [row.id, row.recipient_profile_id]));
  const { data: responses, error: responsesError } = await serviceClient
    .from("responses")
    .select("delivery_id, body, created_at")
    .in(
      "delivery_id",
      deliveryRows.map((row) => row.id),
    )
    .order("created_at", {
      ascending: true,
    });

  if (responsesError) {
    throw responsesError;
  }

  return groupStringsByProfileId(
    (responses ?? []).flatMap((row: ResponseRow) => {
      const profileId = deliveryIdToRecipientId.get(row.delivery_id);

      return profileId
        ? [
            {
              profileId,
              value: row.body,
            },
          ]
        : [];
    }),
  );
}

async function loadConcernRoutingState(serviceClient: ServiceClient, concernId: string) {
  const { data: concern, error: concernError } = await serviceClient
    .from("concerns")
    .select("id, source_type, author_profile_id, body")
    .eq("id", concernId)
    .maybeSingle();

  if (concernError) {
    throw concernError;
  }

  if (!concern) {
    return null;
  }

  const { data: currentDeliveries, error: currentDeliveriesError } = await serviceClient
    .from("concern_deliveries")
    .select("id, recipient_profile_id")
    .eq("concern_id", concernId);

  if (currentDeliveriesError) {
    throw currentDeliveriesError;
  }

  const existingDeliveryCount = (currentDeliveries ?? []).length;
  const normalizedConcern = concern as ConcernRow;

  if (existingDeliveryCount > 0 || normalizedConcern.source_type !== "real" || !normalizedConcern.author_profile_id) {
    return {
      concern: {
        id: normalizedConcern.id,
        sourceType: normalizedConcern.source_type,
        authorProfileId: normalizedConcern.author_profile_id,
        body: normalizedConcern.body,
      },
      author: null,
      existingDeliveryCount,
      candidatePool: [],
    };
  }

  const { data: authorProfile, error: authorProfileError } = await serviceClient
    .from("profiles")
    .select("id, onboarding_completed, gender, is_active, is_blocked")
    .eq("id", normalizedConcern.author_profile_id)
    .maybeSingle();

  if (authorProfileError) {
    throw authorProfileError;
  }

  if (!authorProfile) {
    return {
      concern: {
        id: normalizedConcern.id,
        sourceType: normalizedConcern.source_type,
        authorProfileId: normalizedConcern.author_profile_id,
        body: normalizedConcern.body,
      },
      author: null,
      existingDeliveryCount,
      candidatePool: [],
    };
  }

  const { data: candidateProfiles, error: candidateProfilesError } = await serviceClient
    .from("profiles")
    .select("id, onboarding_completed, gender, is_active, is_blocked")
    .neq("id", normalizedConcern.author_profile_id);

  if (candidateProfilesError) {
    throw candidateProfilesError;
  }

  const normalizedCandidateProfiles = (candidateProfiles ?? []) as ProfileRow[];
  const candidateProfileIds = normalizedCandidateProfiles.map((profile) => profile.id);
  const interestsByProfileId = await selectProfileInterests(serviceClient, [normalizedConcern.author_profile_id, ...candidateProfileIds]);
  const concernBodiesByProfileId = await selectCandidateConcernBodies(serviceClient, candidateProfileIds);
  const responseBodiesByProfileId = await selectCandidateResponseBodies(serviceClient, candidateProfileIds);

  return {
    concern: {
      id: normalizedConcern.id,
      sourceType: normalizedConcern.source_type,
      authorProfileId: normalizedConcern.author_profile_id,
      body: normalizedConcern.body,
    },
    author: {
      profileId: authorProfile.id,
      onboardingCompleted: authorProfile.onboarding_completed,
      gender: authorProfile.gender,
      interests: interestsByProfileId.get(authorProfile.id) ?? [],
      isActive: authorProfile.is_active,
      isBlocked: authorProfile.is_blocked,
    },
    existingDeliveryCount,
    candidatePool: normalizedCandidateProfiles.map((profile) => ({
      profileId: profile.id,
      onboardingCompleted: profile.onboarding_completed,
      gender: profile.gender,
      interests: interestsByProfileId.get(profile.id) ?? [],
      isActive: profile.is_active,
      isBlocked: profile.is_blocked,
      isConcernAuthor: false,
      alreadyAssigned: false,
      alreadyResponded: false,
      priorConcernBodies: concernBodiesByProfileId.get(profile.id) ?? [],
      priorResponseBodies: responseBodiesByProfileId.get(profile.id) ?? [],
    })),
  };
}

async function createConcernDeliveries(serviceClient: ServiceClient, concernId: string, responderProfileIds: string[]) {
  const { error } = await serviceClient.rpc("route_concern_atomic_write", {
    p_concern_id: concernId,
    p_recipient_profile_ids: responderProfileIds,
  });

  if (error) {
    throw error;
  }
}

async function routeApprovedConcernSubmission(serviceClient: ServiceClient, concernId: string) {
  try {
    await routeConcernWithDependencies(
      {
        concernId,
      },
      {
        loadConcernRoutingState: async (requestedConcernId) => loadConcernRoutingState(serviceClient, requestedConcernId),
        selectResponderProfileIds: async (input) => {
          const result = await selectRespondersWithOpenAi(input, {
            apiKey: getRequiredEnv("OPENAI_API_KEY"),
          });

          if (!result.ok) {
            return {
              ok: false as const,
              code: result.code,
            };
          }

          return {
            ok: true as const,
            responderProfileIds: result.responderProfileIds,
          };
        },
        createConcernDeliveries: async ({ concernId: routedConcernId, responderProfileIds }) =>
          createConcernDeliveries(serviceClient, routedConcernId, responderProfileIds),
        logInfo: (payload) => console.info(payload),
        logError: (payload) => console.error(payload),
      },
    );
  } catch (error) {
    console.error({
      event: "routing_unexpected_failure",
      concernId,
      errorMessage: error instanceof Error ? error.message : "unknown routing failure",
    });
  }
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
        persistApprovedConcernSubmission: async ({ actorProfileId, rawSubmittedText, validatedBody, moderation }) => {
          const { data, error } = await serviceClient.rpc(
            "submit_concern_with_moderation_audit",
            buildPersistencePayload({
              actorProfileId,
              rawSubmittedText,
              blocked: false,
              validatedBody,
              categorySummary: moderation.categorySummary,
              rawProviderPayload: moderation.rawProviderPayload,
            }),
          );

          if (error || typeof data !== "string" || data.length === 0) {
            throw error ?? new Error("approved concern submission did not return a concern id");
          }

          return {
            concernId: data,
          };
        },
        routeApprovedConcernSubmission: async ({ concernId }) => {
          await routeApprovedConcernSubmission(serviceClient, concernId);
        },
      },
    );

    return jsonResponse(result.httpStatus, result.body);
  } catch (error) {
    console.error("submit-concern unexpected failure", error);
    return jsonResponse(500, buildServerErrorBody());
  }
});
