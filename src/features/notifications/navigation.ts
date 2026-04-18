import type { NotificationListItem } from "./types";

export type NotificationNavigationTarget = {
  pathname: "/post-concern/my-concerns/responses/[responseId]";
  params: {
    responseId: string;
  };
};

export function getNotificationNavigationTarget(notification: NotificationListItem): NotificationNavigationTarget | null {
  if (notification.type === "response_received" && notification.relatedEntityType === "response") {
    return {
      pathname: "/post-concern/my-concerns/responses/[responseId]",
      params: {
        responseId: notification.relatedEntityId,
      },
    };
  }

  return null;
}
