import { describe, expect, it } from "vitest";

import { getNotificationNavigationTarget } from "./navigation";
import type { NotificationListItem } from "./types";

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
  it("maps response notifications to the authored response-detail route", () => {
    expect(getNotificationNavigationTarget(buildNotification())).toEqual({
      pathname: "/post-concern/my-concerns/responses/[responseId]",
      params: {
        responseId: "a71dfaa7-f4b8-4a86-a94e-f85e220eb63d",
      },
    });
  });

  it("returns null for unsupported notification targets", () => {
    expect(
      getNotificationNavigationTarget(
        buildNotification({
          type: "concern_delivered",
          relatedEntityType: "concern_delivery",
        }),
      ),
    ).toBeNull();
  });
});
