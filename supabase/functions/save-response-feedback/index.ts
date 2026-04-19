import { createClient } from "npm:@supabase/supabase-js@2.56.1";

import { normalizeModerationResponse } from "../../../src/features/concerns/server/moderation.ts";
import { sendNotificationPushes } from "../_shared/expo-push.ts";
import { handleSaveResponseFeedbackRequest } from "./handler.ts";

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
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

function normalizeCommentBody(commentBody: string | null) {
  const normalized = (commentBody ?? "").trim();

  return normalized.length > 0 ? normalized : null;
}

async function moderateFeedbackComment(commentBody: string) {
  const openAiApiKey = getRequiredEnv("OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: commentBody,
    }),
  });

  if (!response.ok) {
    throw new Error(`moderation request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return normalizeModerationResponse(payload);
}

Deno.serve((request) =>
  handleSaveResponseFeedbackRequest(request, {
    requireAuthenticatedUserId,
    async loadProfileId(authUserId) {
      const serviceClient = createServiceClient();
      const { data: profile, error } = await serviceClient.from("profiles").select("id").eq("id", authUserId).maybeSingle();

      if (error) {
        throw error;
      }

      return profile?.id ?? null;
    },
    async saveFeedback({ actorProfileId, responseId, liked, commentBody }) {
      const serviceClient = createServiceClient();
      const normalizedCommentBody = normalizeCommentBody(commentBody);
      const { data: existingFeedback, error: existingFeedbackError } = await serviceClient
        .from("response_feedback")
        .select("comment_body")
        .eq("response_id", responseId)
        .eq("concern_author_profile_id", actorProfileId)
        .maybeSingle();

      if (existingFeedbackError) {
        throw existingFeedbackError;
      }

      const shouldModerateComment =
        normalizedCommentBody !== null &&
        normalizedCommentBody !== normalizeCommentBody((existingFeedback?.comment_body as string | null | undefined) ?? null);
      const moderation = shouldModerateComment
        ? await moderateFeedbackComment(normalizedCommentBody)
        : {
            blocked: false,
            categorySummary: {
              flagged_categories: [],
            },
            rawProviderPayload: {},
          };
      const { data, error } = await serviceClient.rpc("save_response_feedback_with_notifications", {
        p_actor_profile_id: actorProfileId,
        p_response_id: responseId,
        p_liked: liked,
        p_comment_body: commentBody,
        p_blocked: moderation.blocked,
        p_category_summary: moderation.categorySummary,
        p_raw_provider_payload: moderation.rawProviderPayload,
      });

      if (error) {
        throw error;
      }

      return data;
    },
    async sendNotificationPushes(notifications) {
      const serviceClient = createServiceClient();
      await sendNotificationPushes(serviceClient, notifications);
    },
    logError(message, error) {
      console.error(message, error);
    },
  }),
);
