import { createClient } from "npm:@supabase/supabase-js@2.56.1";
import { z } from "zod";

import type { NotificationRelatedEntityType, NotificationType } from "../../../src/features/notifications/types.ts";
import { sendNotificationPushes } from "../_shared/expo-push.ts";

type JsonHeaders = Record<string, string>;

type SaveFeedbackRpcRow = {
  feedback_id: string | null;
  result_code: "saved" | "no_op" | "example_concern_not_allowed" | "response_not_accessible";
  notification_id: string | null;
  notification_profile_id: string | null;
  notification_type: NotificationType | null;
  notification_related_entity_type: NotificationRelatedEntityType | null;
  notification_related_entity_id: string | null;
};

const RequestSchema = z.object({
  responseId: z.string().uuid(),
  liked: z.boolean(),
  commentBody: z.string().nullable(),
});

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

function normalizeRpcResult(data: unknown) {
  const rows = Array.isArray(data) ? (data as SaveFeedbackRpcRow[]) : [];
  const firstRow = rows[0];

  if (!firstRow || typeof firstRow.result_code !== "string") {
    throw new Error("save feedback rpc returned an invalid result");
  }

  const notifications = rows.flatMap((row) => {
    if (
      typeof row.notification_id !== "string" ||
      typeof row.notification_profile_id !== "string" ||
      typeof row.notification_type !== "string" ||
      typeof row.notification_related_entity_type !== "string" ||
      typeof row.notification_related_entity_id !== "string"
    ) {
      return [];
    }

    return [
      {
        notificationId: row.notification_id,
        profileId: row.notification_profile_id,
        type: row.notification_type,
        relatedEntityType: row.notification_related_entity_type,
        relatedEntityId: row.notification_related_entity_id,
      },
    ];
  });

  return {
    resultCode: firstRow.result_code,
    notifications,
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
    console.error("save-response-feedback auth failure", error);
    return jsonResponse(500, {
      code: "feedback_save_failed",
      userMessage: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  if (!authUserId) {
    return jsonResponse(401, {
      code: "auth_required",
      userMessage: "로그인 상태를 다시 확인해 주세요.",
    });
  }

  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return jsonResponse(400, {
      code: "invalid_json",
      userMessage: "요청 형식을 다시 확인해 주세요.",
    });
  }

  const validation = RequestSchema.safeParse(rawPayload);

  if (!validation.success) {
    return jsonResponse(400, {
      code: "invalid_feedback_payload",
      userMessage: "피드백 입력값을 다시 확인해 주세요.",
    });
  }

  try {
    const serviceClient = createServiceClient();
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.id) {
      return jsonResponse(409, {
        code: "profile_not_found",
        userMessage: "프로필 상태를 다시 확인해 주세요.",
      });
    }

    const { data, error } = await serviceClient.rpc("save_response_feedback_with_notifications", {
      p_actor_profile_id: profile.id,
      p_response_id: validation.data.responseId,
      p_liked: validation.data.liked,
      p_comment_body: validation.data.commentBody,
    });

    if (error) {
      throw error;
    }

    const result = normalizeRpcResult(data);

    if (result.resultCode === "response_not_accessible") {
      return jsonResponse(404, {
        code: "response_not_accessible",
        userMessage: "존재하지 않거나 접근할 수 없는 답변입니다.",
      });
    }

    if (result.notifications.length > 0) {
      try {
        await sendNotificationPushes(serviceClient, result.notifications);
      } catch (error) {
        console.error("save-response-feedback push send failure", error);
      }
    }

    return jsonResponse(200, {
      resultCode: result.resultCode,
    });
  } catch (error) {
    console.error("save-response-feedback unexpected failure", error);
    return jsonResponse(500, {
      code: "feedback_save_failed",
      userMessage: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
});
