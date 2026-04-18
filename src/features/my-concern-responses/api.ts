import type { SupabaseClient } from "@supabase/supabase-js";

import { compareMyConcernResponses, mapMyConcernResponseDetail, mapMyConcernResponseListItem } from "./mappers";

type ListMyConcernResponsesRow = {
  response_id: string;
  body: string;
  created_at: string;
};

type GetMyConcernResponseDetailRow = ListMyConcernResponsesRow & {
  concern_id: string;
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
