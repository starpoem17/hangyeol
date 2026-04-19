import { describe, expect, it, vi } from "vitest";

import { getMyProfileSummary, updateMyProfileInterests } from "./api";

function createSupabaseMock(options?: {
  profile?: { data: unknown; error: Error | null };
  interests?: { data: unknown; error: Error | null };
  solvedCount?: { data: unknown; error: Error | null };
  updateInterests?: { data?: unknown; error: Error | null };
}) {
  const profile = options?.profile ?? {
    data: null,
    error: null,
  };
  const interests = options?.interests ?? {
    data: [],
    error: null,
  };
  const solvedCount = options?.solvedCount ?? {
    data: 0,
    error: null,
  };
  const updateInterests = options?.updateInterests ?? {
    data: null,
    error: null,
  };

  const profilesMaybeSingle = vi.fn(async () => profile);
  const profileInterestsOrder = vi.fn(async () => interests);
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          maybeSingle: profilesMaybeSingle,
        })),
      };
    }

    if (table === "profile_interests") {
      return {
        select: vi.fn(() => ({
          order: profileInterestsOrder,
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    if (name === "get_my_solved_count") {
      return solvedCount;
    }

    if (name === "update_my_profile_interests") {
      return {
        ...updateInterests,
        name,
        args,
      };
    }

    throw new Error(`Unexpected rpc: ${name}`);
  });

  return {
    supabase: {
      from,
      rpc,
    },
    from,
    profilesMaybeSingle,
    profileInterestsOrder,
    rpc,
  };
}

describe("getMyProfileSummary", () => {
  it("combines the own profile row, own interest rows, and solved-count RPC into a single summary", async () => {
    const { supabase } = createSupabaseMock({
      profile: {
        data: {
          id: "profile-1",
          gender: "female",
          onboarding_completed: true,
        },
        error: null,
      },
      interests: {
        data: [
          { interest_key: "anxiety" },
          { interest_key: "future" },
          { interest_key: "unknown_interest" },
        ],
        error: null,
      },
      solvedCount: {
        data: "3",
        error: null,
      },
    });

    await expect(getMyProfileSummary(supabase as never)).resolves.toEqual({
      id: "profile-1",
      gender: "female",
      onboardingCompleted: true,
      interestKeys: ["anxiety", "future"],
      solvedCount: 3,
    });
  });

  it("returns null when the own profile row is missing", async () => {
    const { supabase } = createSupabaseMock();

    await expect(getMyProfileSummary(supabase as never)).resolves.toBeNull();
  });
});

describe("updateMyProfileInterests", () => {
  it("uses the deterministic RPC payload for interest replacement", async () => {
    const { supabase, rpc } = createSupabaseMock();

    await expect(
      updateMyProfileInterests(supabase as never, {
        interestKeys: ["future", "study"],
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("update_my_profile_interests", {
      p_interest_keys: ["future", "study"],
    });
  });

  it("maps validation and state errors from the profile interest RPC", async () => {
    const emptyInterests = createSupabaseMock({
      updateInterests: {
        error: {
          code: "22023",
          details: "app_error:profile_interests_empty",
          message: "at least one interest key is required",
        } as unknown as Error,
      },
    });
    const unknownFailure = createSupabaseMock({
      updateInterests: {
        error: {
          code: "XX000",
          details: "unclassified_error",
          message: "db unavailable",
        } as unknown as Error,
      },
    });

    await expect(
      updateMyProfileInterests(emptyInterests.supabase as never, {
        interestKeys: [],
      }),
    ).rejects.toEqual({
      kind: "validation",
      tag: "app_error:profile_interests_empty",
      errorCode: "22023",
      errorMessage: "at least one interest key is required",
      userMessage: "관심 분야를 하나 이상 선택해 주세요.",
    });

    await expect(
      updateMyProfileInterests(unknownFailure.supabase as never, {
        interestKeys: ["future"],
      }),
    ).rejects.toEqual({
      kind: "bootstrap_or_state_error",
      tag: null,
      errorCode: "XX000",
      errorMessage: "db unavailable",
      userMessage: "프로필 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
