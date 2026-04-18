import {
  BODY_TOO_LONG_MESSAGE,
  EMPTY_BODY_MESSAGE,
  INVALID_BODY_MESSAGE,
  MAX_CONCERN_BODY_LENGTH,
  type SubmitConcernErrorResponse,
} from "./contracts.ts";

export type ValidatedConcernSubmission = {
  rawBody: string;
  trimmedBody: string;
};

type ValidationSuccess = {
  success: true;
  data: ValidatedConcernSubmission;
};

type ValidationFailure = {
  success: false;
  error: SubmitConcernErrorResponse;
};

export function validateSubmitConcernPayload(payload: unknown): ValidationSuccess | ValidationFailure {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("body" in payload)) {
    return {
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: INVALID_BODY_MESSAGE,
      },
    };
  }

  const { body } = payload as { body: unknown };

  if (typeof body !== "string") {
    return {
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: INVALID_BODY_MESSAGE,
      },
    };
  }

  const trimmedBody = body.trim();

  if (trimmedBody.length === 0) {
    return {
      success: false,
      error: {
        code: "empty_body",
        userMessage: EMPTY_BODY_MESSAGE,
      },
    };
  }

  if (body.length > MAX_CONCERN_BODY_LENGTH) {
    return {
      success: false,
      error: {
        code: "body_too_long",
        userMessage: BODY_TOO_LONG_MESSAGE,
      },
    };
  }

  return {
    success: true,
    data: {
      rawBody: body,
      trimmedBody,
    },
  };
}
