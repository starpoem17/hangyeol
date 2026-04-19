import { describe, expect, it } from "vitest";

import { getNotificationNavigationTarget, parseNotificationPushPayload } from "./navigation";
import type { NotificationListItem, NotificationPushPayload } from "./types";

function buildNotification(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
  return {
    id: "8f9f7477-6c4d-4766-86e9-55b7d390a5d8",
    type: "response_received",
    relatedEntityType: "response",
    relatedEntityId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
    readAt: null,
    createdAt: "2026-04-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("getNotificationNavigationTarget", () => {
  it("maps concern delivery notifications to the inbox detail route", () => {
    expect(
      getNotificationNavigationTarget(
        buildNotification({
          type: "concern_delivered",
          relatedEntityType: "concern_delivery",
          relatedEntityId: "3555488a-b3e1-4029-b6aa-aa4a6be62d58",
        }),
      ),
    ).toEqual({
      pathname: "/inbox/[deliveryId]",
      params: {
        deliveryId: "3555488a-b3e1-4029-b6aa-aa4a6be62d58",
      },
    });
  });

  it("maps response notifications to the authored response-detail route", () => {
    expect(getNotificationNavigationTarget(buildNotification())).toEqual({
      pathname: "/post-concern/my-concerns/responses/[responseId]",
      params: {
        responseId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
      },
    });
  });

  it("maps feedback result notifications back to the inbox delivery detail route", () => {
    expect(
      getNotificationNavigationTarget(
        buildNotification({
          type: "response_liked",
          relatedEntityType: "concern_delivery",
          relatedEntityId: "3555488a-b3e1-4029-b6aa-aa4a6be62d58",
        }),
      ),
    ).toEqual({
      pathname: "/inbox/[deliveryId]",
      params: {
        deliveryId: "3555488a-b3e1-4029-b6aa-aa4a6be62d58",
      },
    });
  });

  it("returns null for unsupported notification targets", () => {
    expect(
      getNotificationNavigationTarget(
        buildNotification({
          type: "concern_delivered",
          relatedEntityType: "response",
        }),
      ),
    ).toBeNull();
  });
});

describe("parseNotificationPushPayload", () => {
  function buildPayload(overrides: Partial<NotificationPushPayload> = {}): NotificationPushPayload {
    return {
      notificationId: "8f9f7477-6c4d-4766-86e9-55b7d390a5d8",
      type: "response_received",
      relatedEntityType: "response",
      relatedEntityId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
      ...overrides,
    };
  }

  it("accepts the exact four-field payload contract", () => {
    expect(parseNotificationPushPayload(buildPayload())).toEqual(buildPayload());
  });

  it("rejects malformed payloads before route resolution", () => {
    expect(
      parseNotificationPushPayload({
        notificationId: "not-a-uuid",
        type: "response_received",
        relatedEntityType: "response",
        relatedEntityId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
      }),
    ).toBeNull();

    expect(
      parseNotificationPushPayload({
        notificationId: "8f9f7477-6c4d-4766-86e9-55b7d390a5d8",
        type: "unknown",
        relatedEntityType: "response",
        relatedEntityId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
      }),
    ).toBeNull();
  });
});
