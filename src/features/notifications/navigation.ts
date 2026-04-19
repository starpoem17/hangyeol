import type { NotificationPushPayload, NotificationRouteInput, NotificationType, NotificationRelatedEntityType } from "./types";

export type NotificationNavigationTarget = {
  pathname: "/inbox/[deliveryId]" | "/post-concern/my-concerns/responses/[responseId]";
  params: Record<string, string>;
};

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWN_NOTIFICATION_TYPES: NotificationType[] = [
  "concern_delivered",
  "response_received",
  "response_liked",
  "response_commented",
];

const KNOWN_RELATED_ENTITY_TYPES: NotificationRelatedEntityType[] = [
  "concern",
  "concern_delivery",
  "response",
  "response_feedback",
];

function isKnownNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && KNOWN_NOTIFICATION_TYPES.includes(value as NotificationType);
}

function isKnownRelatedEntityType(value: unknown): value is NotificationRelatedEntityType {
  return typeof value === "string" && KNOWN_RELATED_ENTITY_TYPES.includes(value as NotificationRelatedEntityType);
}

function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && UUID_LIKE_PATTERN.test(value);
}

export function getNotificationNavigationTarget(input: NotificationRouteInput): NotificationNavigationTarget | null {
  if (input.type === "concern_delivered" && input.relatedEntityType === "concern_delivery") {
    return {
      pathname: "/inbox/[deliveryId]",
      params: {
        deliveryId: input.relatedEntityId,
      },
    };
  }

  if (input.type === "response_received" && input.relatedEntityType === "response") {
    return {
      pathname: "/post-concern/my-concerns/responses/[responseId]",
      params: {
        responseId: input.relatedEntityId,
      },
    };
  }

  if (
    (input.type === "response_liked" || input.type === "response_commented") &&
    input.relatedEntityType === "concern_delivery"
  ) {
    return {
      pathname: "/inbox/[deliveryId]",
      params: {
        deliveryId: input.relatedEntityId,
      },
    };
  }

  return null;
}

export function parseNotificationPushPayload(value: unknown): NotificationPushPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;

  if (
    !isUuidLike(payload.notificationId) ||
    !isKnownNotificationType(payload.type) ||
    !isKnownRelatedEntityType(payload.relatedEntityType) ||
    !isUuidLike(payload.relatedEntityId)
  ) {
    return null;
  }

  return {
    notificationId: payload.notificationId,
    type: payload.type,
    relatedEntityType: payload.relatedEntityType,
    relatedEntityId: payload.relatedEntityId,
  };
}
