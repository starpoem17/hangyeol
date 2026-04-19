import type { NotificationPushPayload, NotificationRelatedEntityType, NotificationType } from "../types";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: NotificationPushPayload;
};

export type BuildExpoPushMessageInput = {
  expoPushToken: string;
  notificationId: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};

function getPushCopy(type: NotificationType) {
  switch (type) {
    case "concern_delivered":
      return {
        title: "새 고민이 도착했어요",
        body: "Inbox에서 바로 확인해 보세요.",
      };
    case "response_received":
      return {
        title: "내 고민에 새 답변이 도착했어요",
        body: "답변 상세에서 바로 확인할 수 있어요.",
      };
    case "response_liked":
      return {
        title: "내 답변에 도움이 됐다는 반응이 도착했어요",
        body: "Inbox에서 해당 고민과 반응을 함께 확인해 보세요.",
      };
    case "response_commented":
      return {
        title: "내 답변에 후기가 도착했어요",
        body: "Inbox에서 후기 내용을 확인해 보세요.",
      };
  }
}

export function buildExpoPushMessage(input: BuildExpoPushMessageInput): ExpoPushMessage {
  const copy = getPushCopy(input.type);

  return {
    to: input.expoPushToken,
    title: copy.title,
    body: copy.body,
    sound: "default",
    data: {
      notificationId: input.notificationId,
      type: input.type,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  };
}
