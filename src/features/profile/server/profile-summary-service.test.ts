import { describe, expect, it, vi } from "vitest";

import { getProfileSummaryWithDependencies } from "./profile-summary-service";

describe("getProfileSummaryWithDependencies", () => {
  it("returns null when the profile row is missing", async () => {
    await expect(
      getProfileSummaryWithDependencies("profile-1", {
        loadProfileRow: vi.fn().mockResolvedValue(null),
        loadProfileInterests: vi.fn(),
        loadSolvedCount: vi.fn(),
      }),
    ).resolves.toBeNull();
  });

  it("preserves the app-facing summary shape and keeps solved-count server-owned", async () => {
    const loadProfileInterests = vi.fn().mockResolvedValue([
      { interest_key: "anxiety" },
      { interest_key: "future" },
      { interest_key: "unknown_interest" },
    ]);
    const loadSolvedCount = vi.fn().mockResolvedValue("4");

    await expect(
      getProfileSummaryWithDependencies("profile-1", {
        loadProfileRow: vi.fn().mockResolvedValue({
          id: "profile-1",
          gender: "female",
          onboarding_completed: true,
        }),
        loadProfileInterests,
        loadSolvedCount,
      }),
    ).resolves.toEqual({
      id: "profile-1",
      gender: "female",
      onboardingCompleted: true,
      interestKeys: ["anxiety", "future"],
      solvedCount: 4,
    });

    expect(loadProfileInterests).toHaveBeenCalledWith("profile-1");
    expect(loadSolvedCount).toHaveBeenCalledWith("profile-1");
  });
});
