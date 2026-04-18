import type { SupabaseClient } from "@supabase/supabase-js";

import { compareNotifications, mapNotificationListItem } from "./mappers";

export async function listNotifications(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, related_entity_type, related_entity_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapNotificationListItem).sort(compareNotifications);
}
