import { describe, expect, it, vi } from "vitest";

import { getMyProfileSummary, updateMyProfileInterests } from "./api";

function createSupabaseMock(options?: {
  profileSummary?: { data: unknown; error: Error | null };
  updateInterests?: { data?: unknown; error: Error | null };
}) {
  const profileSummary = options?.profileSummary ?? {
    data: null,
    error: null,
  };
  const updateInterests = options?.updateInterests ?? {
    data: null,
    error: null,
  };

  const invoke = vi.fn(async (name: string) => {
    if (name === "get-profile-summary") {
      return profileSummary;
    }

    throw new Error(`Unexpected function invoke: ${name}`);
  });

  const rpc = vi.fn(async (name: string, args?: unknown) => {
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
      functions: {
        invoke,
      },
      rpc,
    },
    invoke,
    rpc,
  };
}

describe("getMyProfileSummary", () => {
  it("preserves the existing app-facing summary shape through the Edge Function", async () => {
    const { supabase } = createSupabaseMock({
      profileSummary: {
        data: {
          id: "profile-1",
          gender: "female" as const,
          onboardingCompleted: true,
          interestKeys: ["anxiety", "future", "unknown_interest"],
          solvedCount: 3,
        },
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
