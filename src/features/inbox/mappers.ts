import type { InboxConcern, InboxDeliveryDetail, InboxDeliveryListItem, InboxResponse, InboxResponseFeedback } from "./types";

type ConcernRelationRow =
  | {
      id: string;
      source_type: "real" | "example";
      body: string;
      created_at: string;
    }
  | null
  | undefined
  | Array<{
      id: string;
      source_type: "real" | "example";
      body: string;
      created_at: string;
    }>;

type InboxDeliveryRow = {
  id: string;
  status: "assigned" | "opened" | "responded";
  delivered_at: string;
  opened_at: string | null;
  responded_at: string | null;
  routing_order: number;
  concern?: ConcernRelationRow;
};

type ResponseRow = {
  id: string;
  delivery_id: string;
  body: string;
  created_at: string;
};

type ResponseFeedbackRow = {
  response_id: string;
  liked: boolean;
  comment_body: string | null;
};

function normalizeConcernRow(row: ConcernRelationRow): InboxConcern {
  const normalized = Array.isArray(row) ? row[0] : row;

  if (!normalized) {
    throw new Error("delivery row is missing its concern relation");
  }

  return {
    id: normalized.id,
    sourceType: normalized.source_type,
    body: normalized.body,
    createdAt: normalized.created_at,
  };
}

function mapInboxDelivery(row: InboxDeliveryRow): InboxDeliveryDetail {
  return {
    id: row.id,
    status: row.status,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
    respondedAt: row.responded_at,
    routingOrder: row.routing_order,
    concern: normalizeConcernRow(row.concern),
  };
}

export function mapInboxDeliveryListItem(row: InboxDeliveryRow): InboxDeliveryListItem {
  const delivery = mapInboxDelivery(row);

  return {
    ...delivery,
    displayRoutingOrder: delivery.concern.sourceType === "example" ? 1 : delivery.routingOrder,
  };
}

export function mapInboxDeliveryDetail(row: InboxDeliveryRow): InboxDeliveryDetail {
  return mapInboxDelivery(row);
}

export function mapInboxResponse(row: ResponseRow): InboxResponse {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapInboxResponseFeedback(row: ResponseFeedbackRow): InboxResponseFeedback {
  return {
    responseId: row.response_id,
    liked: row.liked,
    commentBody: row.comment_body,
  };
}

const STATUS_SORT_ORDER: Record<InboxDeliveryListItem["status"], number> = {
  assigned: 0,
  opened: 1,
  responded: 2,
};

export function compareInboxDeliveries(left: InboxDeliveryListItem, right: InboxDeliveryListItem) {
  const statusOrderDelta = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];

  if (statusOrderDelta !== 0) {
    return statusOrderDelta;
  }

  const deliveredAtDelta = right.deliveredAt.localeCompare(left.deliveredAt);

  if (deliveredAtDelta !== 0) {
    return deliveredAtDelta;
  }

  const displayRoutingOrderDelta = left.displayRoutingOrder - right.displayRoutingOrder;

  if (displayRoutingOrderDelta !== 0) {
    return displayRoutingOrderDelta;
  }

  return left.id.localeCompare(right.id);
}
