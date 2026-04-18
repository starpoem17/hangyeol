import type { SupabaseClient } from "@supabase/supabase-js";

import { compareMyConcernListItems, mapMyConcernDetail, mapMyConcernListItem } from "./mappers";

export async function listMyConcerns(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("concerns")
    .select("id, body, created_at")
    .eq("source_type", "real")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMyConcernListItem).sort(compareMyConcernListItems);
}

export async function getMyConcernDetail(supabase: SupabaseClient, concernId: string) {
  const { data, error } = await supabase
    .from("concerns")
    .select("id, body, created_at")
    .eq("source_type", "real")
    .eq("id", concernId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapMyConcernDetail(data) : null;
}
