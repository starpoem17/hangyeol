import { z } from "zod";

import {
  BODY_TOO_LONG_MESSAGE,
  BODY_TOO_SHORT_MESSAGE,
  EMPTY_BODY_MESSAGE,
  INVALID_BODY_MESSAGE,
  INVALID_DELIVERY_ID_MESSAGE,
  MAX_RESPONSE_BODY_LENGTH,
  MIN_RESPONSE_BODY_LENGTH,
  type SubmitResponseErrorResponse,
} from "./contracts.ts";

const DeliveryIdSchema = z.string().uuid();

export type ValidatedResponseSubmission = {
  deliveryId: string;
  rawBody: string;
  trimmedBody: string;
};

type ValidationSuccess = {
  success: true;
  data: ValidatedResponseSubmission;
};

type ValidationFailure = {
  success: false;
  error: SubmitResponseErrorResponse;
};

export function validateSubmitResponsePayload(payload: unknown): ValidationSuccess | ValidationFailure {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: INVALID_BODY_MESSAGE,
      },
    };
  }

  const candidate = payload as {
    deliveryId?: unknown;
    body?: unknown;
  };

  if (typeof candidate.deliveryId !== "string" || !DeliveryIdSchema.safeParse(candidate.deliveryId).success) {
    return {
      success: false,
      error: {
        code: "invalid_delivery_id",
        userMessage: INVALID_DELIVERY_ID_MESSAGE,
      },
    };
  }

  if (typeof candidate.body !== "string") {
    return {
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: INVALID_BODY_MESSAGE,
      },
    };
  }

  const trimmedBody = candidate.body.trim();

  if (trimmedBody.length === 0) {
    return {
      success: false,
      error: {
        code: "empty_body",
        userMessage: EMPTY_BODY_MESSAGE,
      },
    };
  }

  if (trimmedBody.length < MIN_RESPONSE_BODY_LENGTH) {
    return {
      success: false,
      error: {
        code: "body_too_short",
        userMessage: BODY_TOO_SHORT_MESSAGE,
      },
    };
  }

  if (candidate.body.length > MAX_RESPONSE_BODY_LENGTH) {
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
      deliveryId: candidate.deliveryId,
      rawBody: candidate.body,
      trimmedBody,
    },
  };
}
