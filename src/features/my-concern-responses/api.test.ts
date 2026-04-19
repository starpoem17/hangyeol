import { describe, expect, it, vi } from "vitest";

import { saveMyConcernResponseFeedback } from "./api";

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

describe("saveMyConcernResponseFeedback", () => {
  it("uses the save-response-feedback edge function with the deterministic payload contract", async () => {
    const { supabase, invoke } = createSupabaseMock({
      data: {
        resultCode: "saved",
      },
      error: null,
    });

    const result = await saveMyConcernResponseFeedback(supabase as never, {
      responseId: "response-1",
      liked: true,
      commentBody: "도움이 됐어요.",
    });

    expect(result).toEqual({
      resultCode: "saved",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("save-response-feedback", {
      body: {
        responseId: "response-1",
        liked: true,
        commentBody: "도움이 됐어요.",
      },
    });
  });

  it("preserves no_op, example_concern_not_allowed, and comment_blocked result codes from the edge function", async () => {
    const unchanged = createSupabaseMock({
      data: {
        resultCode: "no_op",
      },
      error: null,
    });
    const exampleConcern = createSupabaseMock({
      data: {
        resultCode: "example_concern_not_allowed",
      },
      error: null,
    });
    const blockedComment = createSupabaseMock({
      data: {
        resultCode: "comment_blocked",
        userMessage: "부적절한 표현이 감지되었습니다.",
      },
      error: null,
    });

    await expect(
      saveMyConcernResponseFeedback(unchanged.supabase as never, {
        responseId: "response-2",
        liked: false,
        commentBody: null,
      }),
    ).resolves.toEqual({
      resultCode: "no_op",
    });

    await expect(
      saveMyConcernResponseFeedback(exampleConcern.supabase as never, {
        responseId: "response-3",
        liked: false,
        commentBody: null,
      }),
    ).resolves.toEqual({
      resultCode: "example_concern_not_allowed",
    });

    await expect(
      saveMyConcernResponseFeedback(blockedComment.supabase as never, {
        responseId: "response-4",
        liked: true,
        commentBody: "차단 대상 코멘트",
      }),
    ).resolves.toEqual({
      resultCode: "comment_blocked",
      userMessage: "부적절한 표현이 감지되었습니다.",
    });
  });

  it("maps response_not_accessible application failures for stale or inaccessible saves", async () => {
    const response = new Response(
      JSON.stringify({
        code: "response_not_accessible",
        userMessage: "존재하지 않거나 접근할 수 없는 답변입니다.",
      }),
      {
        status: 404,
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
      saveMyConcernResponseFeedback(supabase as never, {
        responseId: "response-5",
        liked: true,
        commentBody: null,
      }),
    ).rejects.toEqual({
      kind: "application",
      httpStatus: 404,
      code: "response_not_accessible",
      userMessage: "존재하지 않거나 접근할 수 없는 답변입니다.",
    });
  });
});
