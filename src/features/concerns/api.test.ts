import { describe, expect, it, vi } from "vitest";

import { submitConcern } from "./api";

function createSupabaseMock(result: { data: unknown; error: Error | null }) {
  const invoke = vi.fn(async (name: string, options: unknown) => {
    return {
      data: result.data,
      error: result.error,
      name,
      options,
    };
  });

  return {
    supabase: {
      functions: {
        invoke,
      },
    },
    invoke,
  };
}

describe("submitConcern", () => {
  it("returns approved and blocked outcomes from the edge function unchanged", async () => {
    const approved = createSupabaseMock({
      data: {
        status: "approved",
        concernId: "concern-1",
      },
      error: null,
    });
    const blocked = createSupabaseMock({
      data: {
        status: "blocked",
        code: "moderation_blocked",
        userMessage: "부적절한 표현이 감지되었습니다.",
      },
      error: null,
    });

    await expect(
      submitConcern(approved.supabase as never, {
        body: "승인 가능한 고민",
      }),
    ).resolves.toEqual({
      status: "approved",
      concernId: "concern-1",
    });

    await expect(
      submitConcern(blocked.supabase as never, {
        body: "차단 대상 고민",
      }),
    ).resolves.toEqual({
      status: "blocked",
      code: "moderation_blocked",
      userMessage: "부적절한 표현이 감지되었습니다.",
    });
  });

  it("normalizes application failures from the edge function", async () => {
    const response = new Response(
      JSON.stringify({
        code: "profile_not_found",
        userMessage: "프로필 상태를 다시 확인해 주세요.",
      }),
      {
        status: 409,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    const { supabase } = createSupabaseMock({
      data: null,
      error: {
        context: response,
      } as Error,
    });

    await expect(
      submitConcern(supabase as never, {
        body: "고민",
      }),
    ).rejects.toEqual({
      kind: "application",
      httpStatus: 409,
      code: "profile_not_found",
      userMessage: "프로필 상태를 다시 확인해 주세요.",
    });
  });

  it("normalizes network or missing-data failures into the retryable concern failure shape", async () => {
    const networkFailure = createSupabaseMock({
      data: null,
      error: new Error("network down"),
    });
    const emptySuccess = createSupabaseMock({
      data: null,
      error: null,
    });

    await expect(
      submitConcern(networkFailure.supabase as never, {
        body: "고민",
      }),
    ).rejects.toEqual({
      kind: "network",
      userMessage: "게시를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });

    await expect(
      submitConcern(emptySuccess.supabase as never, {
        body: "고민",
      }),
    ).rejects.toEqual({
      kind: "network",
      userMessage: "게시를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
