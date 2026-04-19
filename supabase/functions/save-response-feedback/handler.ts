import { z } from "zod";

import type { NotificationRelatedEntityType, NotificationType } from "../../../src/features/notifications/types.ts";

type JsonHeaders = Record<string, string>;

export type SaveFeedbackRpcRow = {
  feedback_id: string | null;
  result_code: "saved" | "no_op" | "example_concern_not_allowed" | "response_not_accessible";
  notification_id: string | null;
  notification_profile_id: string | null;
  notification_type: NotificationType | null;
  notification_related_entity_type: NotificationRelatedEntityType | null;
  notification_related_entity_id: string | null;
};

export type NotificationPushJob = {
  notificationId: string;
  profileId: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};

type SaveFeedbackArgs = {
  actorProfileId: string;
  responseId: string;
  liked: boolean;
  commentBody: string | null;
};

export type SaveResponseFeedbackHandlerDeps = {
  requireAuthenticatedUserId(request: Request): Promise<string | null>;
  loadProfileId(authUserId: string): Promise<string | null>;
  saveFeedback(args: SaveFeedbackArgs): Promise<unknown>;
  sendNotificationPushes(notifications: NotificationPushJob[]): Promise<void>;
  logError(message: string, error: unknown): void;
};

const RequestSchema = z.object({
  responseId: z.string().uuid(),
  liked: z.boolean(),
  commentBody: z.string().nullable(),
});

const jsonHeaders: JsonHeaders = {
  "Content-Type": "application/json",
};

export const corsHeaders: JsonHeaders = {
  ...jsonHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown, headers: JsonHeaders = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export function normalizeRpcResult(data: unknown) {
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

export async function handleSaveResponseFeedbackRequest(
  request: Request,
  deps: SaveResponseFeedbackHandlerDeps,
) {
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
    authUserId = await deps.requireAuthenticatedUserId(request);
  } catch (error) {
    deps.logError("save-response-feedback auth failure", error);
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
    const profileId = await deps.loadProfileId(authUserId);

    if (!profileId) {
      return jsonResponse(409, {
        code: "profile_not_found",
        userMessage: "프로필 상태를 다시 확인해 주세요.",
      });
    }

    const data = await deps.saveFeedback({
      actorProfileId: profileId,
      responseId: validation.data.responseId,
      liked: validation.data.liked,
      commentBody: validation.data.commentBody,
    });
    const result = normalizeRpcResult(data);

    if (result.resultCode === "response_not_accessible") {
      return jsonResponse(404, {
        code: "response_not_accessible",
        userMessage: "존재하지 않거나 접근할 수 없는 답변입니다.",
      });
    }

    if (result.notifications.length > 0) {
      try {
        await deps.sendNotificationPushes(result.notifications);
      } catch (error) {
        deps.logError("save-response-feedback push send failure", error);
      }
    }

    return jsonResponse(200, {
      resultCode: result.resultCode,
    });
  } catch (error) {
    deps.logError("save-response-feedback unexpected failure", error);
    return jsonResponse(500, {
      code: "feedback_save_failed",
      userMessage: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}
