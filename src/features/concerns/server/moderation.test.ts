import { describe, expect, it } from "vitest";

import { normalizeModerationResponse } from "./moderation";

describe("normalizeModerationResponse", () => {
  it("treats an unflagged moderation result as approved with an empty summary", () => {
    const payload = {
      id: "modr_1",
      results: [
        {
          flagged: false,
          categories: {
            harassment: false,
            violence: false,
          },
        },
      ],
    };

    expect(normalizeModerationResponse(payload)).toEqual({
      blocked: false,
      categorySummary: {
        flagged_categories: [],
      },
      rawProviderPayload: payload,
    });
  });

  it("produces a deterministic flagged category summary for blocked content", () => {
    const payload = {
      id: "modr_2",
      results: [
        {
          flagged: true,
          categories: {
            violence: true,
            harassment: true,
            sexual: false,
          },
        },
      ],
    };

    expect(normalizeModerationResponse(payload)).toEqual({
      blocked: true,
      categorySummary: {
        flagged_categories: ["harassment", "violence"],
      },
      rawProviderPayload: payload,
    });
  });
});
