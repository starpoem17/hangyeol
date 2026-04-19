import { createClient } from "npm:@supabase/supabase-js@2.56.1";

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
      const { data, error } = await serviceClient.rpc("save_response_feedback_with_notifications", {
        p_actor_profile_id: actorProfileId,
        p_response_id: responseId,
        p_liked: liked,
        p_comment_body: commentBody,
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
