import { buildExpoPushMessage } from "../../../src/features/notifications/server/push-message.ts";
import type { NotificationRelatedEntityType, NotificationType } from "../../../src/features/notifications/types.ts";

type ServiceClientLike = {
  from(table: string): {
    select(query: string): {
      in(column: string, values: string[]): Promise<{
        data: Array<{ profile_id: string; expo_push_token: string }> | null;
        error: Error | null;
      }>;
    };
    delete(): {
      eq(column: string, value: string): Promise<{ error: Error | null }>;
    };
  };
};

type NotificationPushJob = {
  notificationId: string;
  profileId: string;
  type: NotificationType;
  relatedEntityType: NotificationRelatedEntityType;
  relatedEntityId: string;
};

type ExpoPushTicket = {
  status: "ok" | "error";
  details?: {
    error?: string;
  };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

async function loadPushTokens(serviceClient: ServiceClientLike, profileIds: string[]) {
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceClient
    .from("push_tokens")
    .select("profile_id, expo_push_token")
    .in("profile_id", profileIds);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function deletePushToken(serviceClient: ServiceClientLike, expoPushToken: string) {
  const { error } = await serviceClient.from("push_tokens").delete().eq("expo_push_token", expoPushToken);

  if (error) {
    throw error;
  }
}

export async function sendNotificationPushes(serviceClient: ServiceClientLike, notifications: NotificationPushJob[]) {
  if (notifications.length === 0) {
    return;
  }

  const tokens = await loadPushTokens(
    serviceClient,
    Array.from(new Set(notifications.map((notification) => notification.profileId))),
  );

  if (tokens.length === 0) {
    return;
  }

  const messages = notifications.flatMap((notification) =>
    tokens
      .filter((token) => token.profile_id === notification.profileId)
      .map((token) =>
        buildExpoPushMessage({
          expoPushToken: token.expo_push_token,
          notificationId: notification.notificationId,
          type: notification.type,
          relatedEntityType: notification.relatedEntityType,
          relatedEntityId: notification.relatedEntityId,
        }),
      ),
  );

  if (messages.length === 0) {
    return;
  }

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`expo push request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ExpoPushResponse;
  const tickets = Array.isArray(payload.data) ? payload.data : [];

  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];
    const message = messages[index];

    if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      await deletePushToken(serviceClient, message.to);
    }
  }
}
