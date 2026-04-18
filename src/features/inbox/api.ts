import type { SupabaseClient } from "@supabase/supabase-js";

import { compareInboxDeliveries, mapInboxDeliveryDetail, mapInboxDeliveryListItem, mapInboxResponse } from "./mappers";

const DELIVERY_SELECT = `
  id,
  status,
  delivered_at,
  opened_at,
  responded_at,
  routing_order,
  concern:concerns (
    id,
    source_type,
    body,
    created_at
  )
`;

export async function listInboxDeliveries(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("concern_deliveries")
    .select(DELIVERY_SELECT)
    .in("status", ["assigned", "opened"]);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapInboxDeliveryListItem).sort(compareInboxDeliveries);
}

export async function getInboxDeliveryDetail(supabase: SupabaseClient, deliveryId: string) {
  const { data, error } = await supabase.from("concern_deliveries").select(DELIVERY_SELECT).eq("id", deliveryId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapInboxDeliveryDetail(data) : null;
}

export async function getInboxResponseByDeliveryId(supabase: SupabaseClient, deliveryId: string) {
  const { data, error } = await supabase
    .from("responses")
    .select("id, delivery_id, body, created_at")
    .eq("delivery_id", deliveryId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapInboxResponse(data) : null;
}

export async function markConcernDeliveryOpened(supabase: SupabaseClient, deliveryId: string) {
  const { data, error } = await supabase.rpc("mark_concern_delivery_opened", {
    p_delivery_id: deliveryId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}
