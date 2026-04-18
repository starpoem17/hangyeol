import type { SupabaseClient } from "@supabase/supabase-js";

import { SUBMIT_RESPONSE_RETRY_MESSAGE, type SubmitResponseErrorCode, type SubmitResponseErrorResponse, type SubmitResponseRequest, type SubmitResponseSuccessResponse } from "./contracts";

export type SubmitResponseFailure = {
  kind: "application" | "network";
  httpStatus?: number;
  code?: SubmitResponseErrorCode;
  userMessage: string;
};

type ErrorWithContext = {
  context?: Response;
};

function isErrorWithContext(error: unknown): error is ErrorWithContext {
  return typeof error === "object" && error !== null && "context" in error;
}

async function interpretSubmitResponseError(error: unknown): Promise<SubmitResponseFailure> {
  if (isErrorWithContext(error) && error.context instanceof Response) {
    let payload: SubmitResponseErrorResponse | null = null;

    try {
      payload = (await error.context.json()) as SubmitResponseErrorResponse;
    } catch {
      payload = null;
    }

    if (payload?.code && typeof payload.userMessage === "string") {
      return {
        kind: "application",
        httpStatus: error.context.status,
        code: payload.code,
        userMessage: payload.userMessage,
      };
    }
  }

  return {
    kind: "network",
    userMessage: SUBMIT_RESPONSE_RETRY_MESSAGE,
  };
}

export async function submitResponse(supabase: SupabaseClient, input: SubmitResponseRequest) {
  const { data, error } = await supabase.functions.invoke<SubmitResponseSuccessResponse>("submit-response", {
    body: input,
  });

  if (error) {
    throw await interpretSubmitResponseError(error);
  }

  return data;
}
