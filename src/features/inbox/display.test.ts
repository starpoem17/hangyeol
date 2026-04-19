import { describe, expect, it } from "vitest";

import { MINIMUM_VISIBLE_INBOX_ITEMS, selectVisibleInboxDeliveries, shouldLoadInboxFeedback } from "./display";
import type { InboxDeliveryListItem } from "./types";

function buildDelivery(overrides: Partial<InboxDeliveryListItem> = {}): InboxDeliveryListItem {
  return {
    id: "delivery-1",
    status: "assigned",
    deliveredAt: "2026-04-19T09:00:00.000Z",
    openedAt: null,
    respondedAt: null,
    routingOrder: 1,
    displayRoutingOrder: 1,
    concern: {
      id: "concern-1",
      sourceType: "real",
      body: "기본 고민 본문",
      createdAt: "2026-04-19T08:00:00.000Z",
    },
    ...overrides,
  };
}

describe("selectVisibleInboxDeliveries", () => {
  it("fills the inbox with example concerns when real deliveries are insufficient", () => {
    const items = [
      buildDelivery({
        id: "real-1",
        deliveredAt: "2026-04-19T07:00:00.000Z",
      }),
      buildDelivery({
        id: "example-1",
        deliveredAt: "2026-04-19T10:00:00.000Z",
        concern: {
          id: "example-concern-1",
          sourceType: "example",
          body: "예제 고민 1",
          createdAt: "2026-04-19T06:00:00.000Z",
        },
      }),
      buildDelivery({
        id: "example-2",
        deliveredAt: "2026-04-19T09:30:00.000Z",
        concern: {
          id: "example-concern-2",
          sourceType: "example",
          body: "예제 고민 2",
          createdAt: "2026-04-19T06:30:00.000Z",
        },
      }),
      buildDelivery({
        id: "example-3",
        deliveredAt: "2026-04-19T09:15:00.000Z",
        concern: {
          id: "example-concern-3",
          sourceType: "example",
          body: "예제 고민 3",
          createdAt: "2026-04-19T06:45:00.000Z",
        },
      }),
    ];

    const visibleItems = selectVisibleInboxDeliveries(items, MINIMUM_VISIBLE_INBOX_ITEMS);

    expect(visibleItems.map((item) => item.id)).toEqual(["real-1", "example-1", "example-2"]);
  });

  it("does not show example concerns when real deliveries already satisfy the visible inbox target", () => {
    const visibleItems = selectVisibleInboxDeliveries([
      buildDelivery({
        id: "real-1",
        deliveredAt: "2026-04-19T10:00:00.000Z",
      }),
      buildDelivery({
        id: "real-2",
        deliveredAt: "2026-04-19T09:00:00.000Z",
      }),
      buildDelivery({
        id: "real-3",
        deliveredAt: "2026-04-19T08:00:00.000Z",
      }),
      buildDelivery({
        id: "example-1",
        deliveredAt: "2026-04-19T11:00:00.000Z",
        concern: {
          id: "example-concern-1",
          sourceType: "example",
          body: "예제 고민 1",
          createdAt: "2026-04-19T07:00:00.000Z",
        },
      }),
    ]);

    expect(visibleItems.map((item) => item.id)).toEqual(["real-1", "real-2", "real-3"]);
  });

  it("treats example deliveries with equal normalized display order as ordered by id instead of raw routing order", () => {
    const visibleItems = selectVisibleInboxDeliveries(
      [
        buildDelivery({
          id: "example-b",
          deliveredAt: "2026-04-19T10:00:00.000Z",
          routingOrder: 4,
          displayRoutingOrder: 1,
          concern: {
            id: "example-concern-b",
            sourceType: "example",
            body: "예제 고민 B",
            createdAt: "2026-04-19T06:30:00.000Z",
          },
        }),
        buildDelivery({
          id: "example-a",
          deliveredAt: "2026-04-19T10:00:00.000Z",
          routingOrder: 12,
          displayRoutingOrder: 1,
          concern: {
            id: "example-concern-a",
            sourceType: "example",
            body: "예제 고민 A",
            createdAt: "2026-04-19T06:00:00.000Z",
          },
        }),
      ],
      2,
    );

    expect(visibleItems.map((item) => item.id)).toEqual(["example-a", "example-b"]);
  });
});

describe("shouldLoadInboxFeedback", () => {
  it("loads feedback only for real concerns", () => {
    expect(shouldLoadInboxFeedback(buildDelivery())).toBe(true);
    expect(
      shouldLoadInboxFeedback(
        buildDelivery({
          concern: {
            id: "example-concern-1",
            sourceType: "example",
            body: "예제 고민",
            createdAt: "2026-04-19T07:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
    expect(shouldLoadInboxFeedback(null)).toBe(false);
  });
});
