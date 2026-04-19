export type ConcernSourceType = "real" | "example";
export type InboxDeliveryStatus = "assigned" | "opened" | "responded";

export type InboxConcern = {
  id: string;
  sourceType: ConcernSourceType;
  body: string;
  createdAt: string;
};

export type InboxDeliveryListItem = {
  id: string;
  status: InboxDeliveryStatus;
  deliveredAt: string;
  openedAt: string | null;
  respondedAt: string | null;
  routingOrder: number;
  displayRoutingOrder: number;
  concern: InboxConcern;
};

export type InboxDeliveryDetail = {
  id: string;
  status: InboxDeliveryStatus;
  deliveredAt: string;
  openedAt: string | null;
  respondedAt: string | null;
  routingOrder: number;
  concern: InboxConcern;
};

export type InboxResponse = {
  id: string;
  deliveryId: string;
  body: string;
  createdAt: string;
};

export type InboxResponseFeedback = {
  responseId: string;
  liked: boolean;
  commentBody: string | null;
};
