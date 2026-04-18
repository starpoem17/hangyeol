import { createClient } from "npm:@supabase/supabase-js@2.56.1";

import {
  AUTH_REQUIRED_MESSAGE,
  INVALID_JSON_MESSAGE,
  SUBMIT_RESPONSE_RETRY_MESSAGE,
  type SubmitResponseErrorResponse,
} from "../../../src/features/responses/contracts.ts";
import { normalizeModerationResponse } from "../../../src/features/concerns/server/moderation.ts";
import {
  submitResponseWithDependencies,
  type PersistResponseSubmissionResult,
} from "../../../src/features/responses/server/submit-response-service.ts";

type JsonHeaders = Record<string, string>;

type ResponseModerationRpcPayload = {
  p_actor_profile_id: string;
  p_delivery_id: string;
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
  deliveryId: string;
  rawSubmittedText: string;
  blocked: boolean;
  validatedBody: string | null;
  categorySummary: Record<string, unknown>;
  rawProviderPayload: unknown;
}): ResponseModerationRpcPayload {
  return {
    p_actor_profile_id: base.actorProfileId,
    p_delivery_id: base.deliveryId,
    p_raw_submitted_text: base.rawSubmittedText,
    p_validated_body: base.validatedBody,
    p_blocked: base.blocked,
    p_category_summary: base.categorySummary,
    p_raw_provider_payload: base.rawProviderPayload,
  };
}

async function moderateResponseBody(rawBody: string) {
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

function buildServerErrorBody(): SubmitResponseErrorResponse {
  return {
    code: "response_submission_failed",
    userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
  };
}

function normalizeRpcResult(data: unknown): PersistResponseSubmissionResult {
  const row = Array.isArray(data) ? data[0] : data;

  if (
    !row ||
    typeof row !== "object" ||
    !("result_code" in row) ||
    typeof row.result_code !== "string" ||
    !("notification_created" in row) ||
    typeof row.notification_created !== "boolean"
  ) {
    throw new Error("response submission rpc returned an invalid result");
  }

  const resultRow = row as {
    response_id?: string | null;
    result_code: PersistResponseSubmissionResult["resultCode"];
    notification_created: boolean;
  };

  const responseId = typeof resultRow.response_id === "string" || resultRow.response_id === null ? resultRow.response_id : null;

  return {
    responseId,
    resultCode: resultRow.result_code,
    notificationCreated: resultRow.notification_created,
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
    console.error("submit-response auth failure", error);
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

    const result = await submitResponseWithDependencies(
      {
        authUserId,
        payload,
      },
      {
        resolveProfileId: async (resolvedAuthUserId) => {
          const { data, error } = await serviceClient.from("profiles").select("id").eq("id", resolvedAuthUserId).maybeSingle();

          if (error) {
            throw error;
          }

          return data?.id ?? null;
        },
        moderateResponseBody,
        persistResponseSubmission: async ({ actorProfileId, deliveryId, rawSubmittedText, validatedBody, moderation }) => {
          const { data, error } = await serviceClient.rpc(
            "submit_response_with_moderation_audit",
            buildPersistencePayload({
              actorProfileId,
              deliveryId,
              rawSubmittedText,
              blocked: moderation.blocked,
              validatedBody,
              categorySummary: moderation.categorySummary,
              rawProviderPayload: moderation.rawProviderPayload,
            }),
          );

          if (error) {
            throw error;
          }

          return normalizeRpcResult(data);
        },
      },
    );

    return jsonResponse(result.httpStatus, result.body);
  } catch (error) {
    console.error("submit-response unexpected failure", error);
    return jsonResponse(500, buildServerErrorBody());
  }
});
