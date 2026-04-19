import {
  AUTH_REQUIRED_MESSAGE,
  DELIVERY_ALREADY_RESPONDED_MESSAGE,
  DELIVERY_NOT_ACCESSIBLE_MESSAGE,
  PROFILE_NOT_FOUND_MESSAGE,
  RESPONSE_BLOCKED_MESSAGE,
  SUBMIT_RESPONSE_RETRY_MESSAGE,
  type SubmitResponseErrorResponse,
  type SubmitResponseSuccessResponse,
} from "../contracts.ts";
import { validateSubmitResponsePayload } from "../validation.ts";
import type { ModerationDecision } from "../../concerns/server/moderation.ts";
import type { NotificationRelatedEntityType, NotificationType } from "../../notifications/types.ts";

export type SubmitResponseRpcResultCode = "blocked" | "approved" | "delivery_not_accessible" | "delivery_already_responded";

export type SubmitResponseServiceResult =
  | {
      ok: true;
      httpStatus: 200;
      body: SubmitResponseSuccessResponse;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 404 | 409 | 500 | 502;
      body: SubmitResponseErrorResponse;
    };

export type SubmitResponseServiceInput = {
  authUserId: string;
  payload: unknown;
};

export type PersistResponseSubmissionInput = {
  actorProfileId: string;
  deliveryId: string;
  rawSubmittedText: string;
  validatedBody: string | null;
  moderation: ModerationDecision;
};

export type PersistedNotification = {
  id: string;
  profileId: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};

export type PersistResponseSubmissionResult = {
  responseId: string | null;
  resultCode: SubmitResponseRpcResultCode;
  notificationCreated: boolean;
  notifications: PersistedNotification[];
};

export type SubmitResponseServiceDependencies = {
  resolveProfileId(authUserId: string): Promise<string | null>;
  moderateResponseBody(rawBody: string): Promise<ModerationDecision>;
  persistResponseSubmission(input: PersistResponseSubmissionInput): Promise<PersistResponseSubmissionResult>;
};

function buildError(httpStatus: 400 | 401 | 404 | 409 | 500 | 502, body: SubmitResponseErrorResponse): SubmitResponseServiceResult {
  return {
    ok: false,
    httpStatus,
    body,
  };
}

export async function submitResponseWithDependencies(
  input: SubmitResponseServiceInput,
  dependencies: SubmitResponseServiceDependencies,
): Promise<SubmitResponseServiceResult> {
  if (!input.authUserId) {
    return buildError(401, {
      code: "auth_required",
      userMessage: AUTH_REQUIRED_MESSAGE,
    });
  }

  let actorProfileId: string | null;

  try {
    actorProfileId = await dependencies.resolveProfileId(input.authUserId);
  } catch {
    return buildError(500, {
      code: "response_submission_failed",
      userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
    });
  }

  if (!actorProfileId) {
    return buildError(409, {
      code: "profile_not_found",
      userMessage: PROFILE_NOT_FOUND_MESSAGE,
    });
  }

  const validation = validateSubmitResponsePayload(input.payload);

  if (!validation.success) {
    return buildError(400, validation.error);
  }

  let moderation: ModerationDecision;

  try {
    moderation = await dependencies.moderateResponseBody(validation.data.rawBody);
  } catch {
    return buildError(502, {
      code: "moderation_unavailable",
      userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
    });
  }

  let persistenceResult: PersistResponseSubmissionResult;

  try {
    persistenceResult = await dependencies.persistResponseSubmission({
      actorProfileId,
      deliveryId: validation.data.deliveryId,
      rawSubmittedText: validation.data.rawBody,
      validatedBody: moderation.blocked ? null : validation.data.trimmedBody,
      moderation,
    });
  } catch {
    return buildError(500, {
      code: "response_submission_failed",
      userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
    });
  }

  if (persistenceResult.resultCode === "blocked") {
    return {
      ok: true,
      httpStatus: 200,
      body: {
        status: "blocked",
        code: "moderation_blocked",
        userMessage: RESPONSE_BLOCKED_MESSAGE,
      },
    };
  }

  if (persistenceResult.resultCode === "approved" && persistenceResult.responseId) {
    return {
      ok: true,
      httpStatus: 200,
      body: {
        status: "approved",
        responseId: persistenceResult.responseId,
      },
    };
  }

  if (persistenceResult.resultCode === "delivery_not_accessible") {
    return buildError(404, {
      code: "delivery_not_accessible",
      userMessage: DELIVERY_NOT_ACCESSIBLE_MESSAGE,
    });
  }

  if (persistenceResult.resultCode === "delivery_already_responded") {
    return buildError(409, {
      code: "delivery_already_responded",
      userMessage: DELIVERY_ALREADY_RESPONDED_MESSAGE,
    });
  }

  return buildError(500, {
    code: "response_submission_failed",
    userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
  });
}
