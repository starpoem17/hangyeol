import { describe, expect, it } from "vitest";

import { compareInboxDeliveries, mapInboxDeliveryDetail, mapInboxDeliveryListItem } from "./mappers";

function buildRow(overrides: Partial<Parameters<typeof mapInboxDeliveryListItem>[0]> = {}) {
  return {
    id: "delivery-1",
    status: "assigned" as const,
    delivered_at: "2026-04-19T09:00:00.000Z",
    opened_at: null,
    responded_at: null,
    routing_order: 1,
    concern: {
      id: "concern-1",
      source_type: "real" as const,
      body: "기본 고민 본문",
      created_at: "2026-04-19T08:00:00.000Z",
    },
    ...overrides,
  };
}

describe("mapInboxDeliveryListItem", () => {
  it("preserves the raw routing order for a real list item and mirrors it as displayRoutingOrder", () => {
    const item = mapInboxDeliveryListItem(
      buildRow({
        routing_order: 3,
      }),
    );

    expect(item.routingOrder).toBe(3);
    expect(item.displayRoutingOrder).toBe(3);
  });

  it("preserves the raw routing order for an example list item while normalizing displayRoutingOrder", () => {
    const item = mapInboxDeliveryListItem(
      buildRow({
        routing_order: 12,
        concern: {
          id: "example-concern-1",
          source_type: "example",
          body: "예제 고민",
          created_at: "2026-04-19T08:00:00.000Z",
        },
      }),
    );

    expect(item.routingOrder).toBe(12);
    expect(item.displayRoutingOrder).toBe(1);
  });

  it("normalizes all example list items to the same displayRoutingOrder", () => {
    const lowerRawOrder = mapInboxDeliveryListItem(
      buildRow({
        id: "example-4",
        routing_order: 4,
        concern: {
          id: "example-concern-4",
          source_type: "example",
          body: "예제 고민 4",
          created_at: "2026-04-19T08:00:00.000Z",
        },
      }),
    );
    const higherRawOrder = mapInboxDeliveryListItem(
      buildRow({
        id: "example-12",
        routing_order: 12,
        concern: {
          id: "example-concern-12",
          source_type: "example",
          body: "예제 고민 12",
          created_at: "2026-04-19T08:00:00.000Z",
        },
      }),
    );

    expect(lowerRawOrder.displayRoutingOrder).toBe(1);
    expect(higherRawOrder.displayRoutingOrder).toBe(1);
  });
});

describe("mapInboxDeliveryDetail", () => {
  it("preserves the raw routing order for detail items without exposing displayRoutingOrder", () => {
    const detail = mapInboxDeliveryDetail(
      buildRow({
        routing_order: 12,
      }),
    );

    expect(detail.routingOrder).toBe(12);
    expect("displayRoutingOrder" in detail).toBe(false);
  });
});

describe("compareInboxDeliveries", () => {
  it("ignores raw routingOrder once normalized displayRoutingOrder is equal", () => {
    const exampleA = mapInboxDeliveryListItem(
      buildRow({
        id: "example-a",
        delivered_at: "2026-04-19T10:00:00.000Z",
        routing_order: 12,
        concern: {
          id: "example-concern-a",
          source_type: "example",
          body: "예제 고민 A",
          created_at: "2026-04-19T08:00:00.000Z",
        },
      }),
    );
    const exampleB = mapInboxDeliveryListItem(
      buildRow({
        id: "example-b",
        delivered_at: "2026-04-19T10:00:00.000Z",
        routing_order: 4,
        concern: {
          id: "example-concern-b",
          source_type: "example",
          body: "예제 고민 B",
          created_at: "2026-04-19T08:00:00.000Z",
        },
      }),
    );

    expect(compareInboxDeliveries(exampleA, exampleB)).toBeLessThan(0);
  });
});
