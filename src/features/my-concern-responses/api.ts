import type { SupabaseClient } from "@supabase/supabase-js";

import { compareMyConcernResponses, mapMyConcernResponseDetail, mapMyConcernResponseFeedback, mapMyConcernResponseListItem } from "./mappers";

type ListMyConcernResponsesRow = {
  response_id: string;
  body: string;
  created_at: string;
};

type GetMyConcernResponseDetailRow = ListMyConcernResponsesRow & {
  concern_id: string;
};

type GetMyConcernResponseFeedbackRow = {
  response_id: string;
  liked: boolean;
  comment_body: string | null;
};

type SaveMyConcernResponseFeedbackInput = {
  responseId: string;
  liked: boolean;
  commentBody: string | null;
};

export type SaveMyConcernResponseFeedbackResult =
  | {
      resultCode: "saved" | "no_op" | "example_concern_not_allowed";
    }
  | {
      resultCode: "comment_blocked";
      userMessage: string;
    };

export type SaveMyConcernResponseFeedbackFailure = {
  kind: "application" | "network";
  httpStatus?: number;
  code?: "response_not_accessible";
  userMessage: string;
};

type SaveFeedbackErrorResponse = {
  code?: string;
  userMessage?: string;
};

type ErrorWithContext = {
  context?: Response;
};

function isErrorWithContext(error: unknown): error is ErrorWithContext {
  return typeof error === "object" && error !== null && "context" in error;
}

async function interpretSaveFeedbackError(error: unknown): Promise<SaveMyConcernResponseFeedbackFailure> {
  if (isErrorWithContext(error) && error.context instanceof Response) {
    let payload: SaveFeedbackErrorResponse | null = null;

    try {
      payload = (await error.context.json()) as SaveFeedbackErrorResponse;
    } catch {
      payload = null;
    }

    if (payload?.code === "response_not_accessible" && typeof payload.userMessage === "string") {
      return {
        kind: "application",
        httpStatus: error.context.status,
        code: "response_not_accessible",
        userMessage: payload.userMessage,
      };
    }
  }

  return {
    kind: "network",
    userMessage: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}

export async function listMyConcernResponses(supabase: SupabaseClient, concernId: string) {
  const { data, error } = await supabase.rpc("list_my_concern_responses", {
    p_concern_id: concernId,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ListMyConcernResponsesRow[]).map(mapMyConcernResponseListItem).sort(compareMyConcernResponses);
}

export async function getMyConcernResponseDetail(supabase: SupabaseClient, responseId: string) {
  const { data, error } = await supabase.rpc("get_my_concern_response_detail", {
    p_response_id: responseId,
  });

  if (error) {
    throw error;
  }

  const row = ((data ?? []) as GetMyConcernResponseDetailRow[])[0];

  return row ? mapMyConcernResponseDetail(row) : null;
}

export async function getMyConcernResponseFeedback(supabase: SupabaseClient, responseId: string) {
  const { data, error } = await supabase
    .from("response_feedback")
    .select("response_id, liked, comment_body")
    .eq("response_id", responseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapMyConcernResponseFeedback(data as GetMyConcernResponseFeedbackRow) : null;
}

export async function saveMyConcernResponseFeedback(supabase: SupabaseClient, input: SaveMyConcernResponseFeedbackInput) {
  const { data, error } = await supabase.functions.invoke<SaveMyConcernResponseFeedbackResult>("save-response-feedback", {
    body: {
      responseId: input.responseId,
      liked: input.liked,
      commentBody: input.commentBody,
    },
  });

  if (error) {
    throw await interpretSaveFeedbackError(error);
  }

  if (!data) {
    throw {
      kind: "network",
      userMessage: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    } satisfies SaveMyConcernResponseFeedbackFailure;
  }

  return data;
}
