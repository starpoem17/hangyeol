import { describe, expect, it } from "vitest";

import { compareMyConcernListItems } from "./mappers";
import type { MyConcernListItem } from "./types";

describe("compareMyConcernListItems", () => {
  it("orders authored concerns by createdAt desc and id desc", () => {
    const items: MyConcernListItem[] = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        body: "older",
        createdAt: "2026-04-18T09:00:00.000Z",
      },
      {
        id: "30000000-0000-0000-0000-000000000003",
        body: "newest-high-id",
        createdAt: "2026-04-18T10:00:00.000Z",
      },
      {
        id: "20000000-0000-0000-0000-000000000002",
        body: "newest-low-id",
        createdAt: "2026-04-18T10:00:00.000Z",
      },
    ];

    expect(items.sort(compareMyConcernListItems).map((item) => item.id)).toEqual([
      "30000000-0000-0000-0000-000000000003",
      "20000000-0000-0000-0000-000000000002",
      "10000000-0000-0000-0000-000000000001",
    ]);
  });
});
