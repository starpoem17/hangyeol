import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SUBMIT_CONCERN_RETRY_MESSAGE,
  type SubmitConcernErrorCode,
  type SubmitConcernErrorResponse,
  type SubmitConcernRequest,
  type SubmitConcernSuccessResponse,
} from "./contracts";

export type SubmitConcernFailure = {
  kind: "application" | "network";
  httpStatus?: number;
  code?: SubmitConcernErrorCode;
  userMessage: string;
};

type ErrorWithContext = {
  context?: Response;
};

function isErrorWithContext(error: unknown): error is ErrorWithContext {
  return typeof error === "object" && error !== null && "context" in error;
}

async function interpretSubmitConcernError(error: unknown): Promise<SubmitConcernFailure> {
  if (isErrorWithContext(error) && error.context instanceof Response) {
    let payload: SubmitConcernErrorResponse | null = null;

    try {
      payload = (await error.context.json()) as SubmitConcernErrorResponse;
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
    userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
  };
}

export async function submitConcern(supabase: SupabaseClient, input: SubmitConcernRequest) {
  const { data, error } = await supabase.functions.invoke<SubmitConcernSuccessResponse>("submit-concern", {
    body: input,
  });

  if (error) {
    throw await interpretSubmitConcernError(error);
  }

  if (!data) {
    throw {
      kind: "network",
      userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
    } satisfies SubmitConcernFailure;
  }

  return data;
}
