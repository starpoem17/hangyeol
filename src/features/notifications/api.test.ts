import { describe, expect, it, vi } from "vitest";

import { listNotifications, markNotificationRead } from "./api";

function createSupabaseMock() {
  const orderSecondary = vi.fn(async () => ({
    data: [
      {
        id: "2",
        type: "response_received",
        related_entity_type: "response",
        related_entity_id: "response-1",
        read_at: null,
        created_at: "2026-04-20T10:00:00.000Z",
      },
      {
        id: "1",
        type: "concern_delivered",
        related_entity_type: "concern_delivery",
        related_entity_id: "delivery-1",
        read_at: "2026-04-20T09:00:00.000Z",
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ],
    error: null,
  }));
  const orderPrimary = vi.fn(() => ({
    order: orderSecondary,
  }));
  const select = vi.fn(() => ({
    order: orderPrimary,
  }));
  const from = vi.fn(() => ({
    select,
  }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "mark_notification_read") {
      return {
        data: true,
        error: null,
      };
    }

    throw new Error(`unexpected rpc ${name}`);
  });

  return {
    supabase: {
      from,
      rpc,
    },
    from,
    select,
    orderPrimary,
    orderSecondary,
    rpc,
  };
}

describe("listNotifications", () => {
  it("reads real notification rows and maps read_at as the only read state", async () => {
    const { supabase, from } = createSupabaseMock();

    await expect(listNotifications(supabase as never)).resolves.toEqual([
      {
        id: "2",
        type: "response_received",
        relatedEntityType: "response",
        relatedEntityId: "response-1",
        readAt: null,
        createdAt: "2026-04-20T10:00:00.000Z",
      },
      {
        id: "1",
        type: "concern_delivered",
        relatedEntityType: "concern_delivery",
        relatedEntityId: "delivery-1",
        readAt: "2026-04-20T09:00:00.000Z",
        createdAt: "2026-04-20T09:00:00.000Z",
      },
    ]);

    expect(from).toHaveBeenCalledWith("notifications");
  });
});

describe("markNotificationRead", () => {
  it("uses the mark_notification_read rpc", async () => {
    const { supabase, rpc } = createSupabaseMock();

    await expect(markNotificationRead(supabase as never, "notification-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("mark_notification_read", {
      p_notification_id: "notification-1",
    });
  });
});
