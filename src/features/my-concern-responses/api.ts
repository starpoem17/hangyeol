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
  concernAuthorProfileId: string;
  liked: boolean;
  commentBody: string | null;
};

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
  const payload = {
    response_id: input.responseId,
    concern_author_profile_id: input.concernAuthorProfileId,
    liked: input.liked,
    comment_body: input.commentBody,
  };
  const { error } = await supabase.from("response_feedback").upsert(payload, {
    onConflict: "response_id,concern_author_profile_id",
  });

  if (error) {
    throw error;
  }
}
