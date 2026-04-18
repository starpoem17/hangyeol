export type NotificationType =
  | "concern_delivered"
  | "response_received"
  | "response_liked"
  | "response_commented";

export type NotificationRelatedEntityType = "concern" | "concern_delivery" | "response" | "response_feedback";

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
  readAt: string | null;
  createdAt: string;
};
