export type NotificationType =
  | "concern_delivered"
  | "response_received"
  | "response_liked"
  | "response_commented";

export type NotificationRelatedEntityType = "concern" | "concern_delivery" | "response" | "response_feedback";

export type NotificationRouteInput = {
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};

export type NotificationListItem = NotificationRouteInput & {
  id: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPushPayload = {
  notificationId: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};
