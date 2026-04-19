import { describe, expect, it } from "vitest";

import { compareNotifications, mapNotificationListItem } from "./mappers";

describe("mapNotificationListItem", () => {
  it("derives unread state only from read_at", () => {
    expect(
      mapNotificationListItem({
        id: "notification-1",
        type: "response_received",
        related_entity_type: "response",
        related_entity_id: "response-1",
        read_at: null,
        created_at: "2026-04-20T10:00:00.000Z",
      }),
    ).toEqual({
      id: "notification-1",
      type: "response_received",
      relatedEntityType: "response",
      relatedEntityId: "response-1",
      readAt: null,
      createdAt: "2026-04-20T10:00:00.000Z",
    });
  });
});

describe("compareNotifications", () => {
  it("sorts by created_at desc and id desc as a stable fallback", () => {
    expect(
      compareNotifications(
        {
          id: "1",
          type: "response_received",
          relatedEntityType: "response",
          relatedEntityId: "response-1",
          readAt: null,
          createdAt: "2026-04-20T09:00:00.000Z",
        },
        {
          id: "2",
          type: "response_received",
          relatedEntityType: "response",
          relatedEntityId: "response-2",
          readAt: null,
          createdAt: "2026-04-20T10:00:00.000Z",
        },
      ),
    ).toBeGreaterThan(0);
  });
});
