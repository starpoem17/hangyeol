import { describe, expect, it, vi } from "vitest";

import { listInboxDeliveries } from "./api";

type SelectResult = {
  data: unknown;
  error: Error | null;
};

function createSupabaseMock(result: SelectResult) {
  const inFilter = vi.fn(async () => result);
  const select = vi.fn(() => ({
    in: inFilter,
  }));
  const from = vi.fn(() => ({
    select,
  }));
  const rpc = vi.fn(async () => ({
    data: 1,
    error: null,
  }));

  return {
    supabase: {
      rpc,
      from,
    },
    rpc,
    from,
    select,
    inFilter,
  };
}

describe("listInboxDeliveries", () => {
  it("provisions example supply before loading and only returns enough examples to fill the inbox target", async () => {
    const { supabase, rpc, from, inFilter } = createSupabaseMock({
      data: [
        {
          id: "real-1",
          status: "assigned",
          delivered_at: "2026-04-19T08:00:00.000Z",
          opened_at: null,
          responded_at: null,
          routing_order: 1,
          concern: {
            id: "concern-real-1",
            source_type: "real",
            body: "실사용자 고민",
            created_at: "2026-04-19T07:00:00.000Z",
          },
        },
        {
          id: "example-1",
          status: "assigned",
          delivered_at: "2026-04-19T10:00:00.000Z",
          opened_at: null,
          responded_at: null,
          routing_order: 4,
          concern: {
            id: "concern-example-1",
            source_type: "example",
            body: "예제 고민 1",
            created_at: "2026-04-18T07:00:00.000Z",
          },
        },
        {
          id: "example-2",
          status: "assigned",
          delivered_at: "2026-04-19T09:30:00.000Z",
          opened_at: null,
          responded_at: null,
          routing_order: 5,
          concern: {
            id: "concern-example-2",
            source_type: "example",
            body: "예제 고민 2",
            created_at: "2026-04-18T07:30:00.000Z",
          },
        },
        {
          id: "example-3",
          status: "assigned",
          delivered_at: "2026-04-19T09:00:00.000Z",
          opened_at: null,
          responded_at: null,
          routing_order: 6,
          concern: {
            id: "concern-example-3",
            source_type: "example",
            body: "예제 고민 3",
            created_at: "2026-04-18T08:00:00.000Z",
          },
        },
      ],
      error: null,
    });

    const items = await listInboxDeliveries(supabase as never);

    expect(rpc).toHaveBeenCalledWith("ensure_example_inbox_supply", {
      p_target_visible_count: 3,
    });
    expect(from).toHaveBeenCalledWith("concern_deliveries");
    expect(inFilter).toHaveBeenCalledWith("status", ["assigned", "opened"]);
    expect(items.map((item) => item.id)).toEqual(["real-1", "example-1", "example-2"]);
    expect(items.find((item) => item.id === "real-1")).toMatchObject({
      routingOrder: 1,
      displayRoutingOrder: 1,
    });
    expect(items.find((item) => item.id === "example-1")).toMatchObject({
      routingOrder: 4,
      displayRoutingOrder: 1,
    });
    expect(items.find((item) => item.id === "example-2")).toMatchObject({
      routingOrder: 5,
      displayRoutingOrder: 1,
    });
  });
});
