import { describe, expect, it, vi } from "vitest";

import { saveMyConcernResponseFeedback } from "./api";

function createSupabaseMock(result: { error: Error | null }) {
  const upsert = vi.fn(async (payload: unknown, options: unknown) => {
    return {
      data: null,
      error: result.error,
      payload,
      options,
    };
  });
  const insert = vi.fn();
  const update = vi.fn();
  const from = vi.fn(() => ({
    upsert,
    insert,
    update,
  }));

  return {
    supabase: {
      from,
    },
    from,
    upsert,
    insert,
    update,
  };
}

describe("saveMyConcernResponseFeedback", () => {
  it("uses one conflict-safe upsert path with the exact persisted fields and conflict target", async () => {
    const { supabase, from, upsert, insert, update } = createSupabaseMock({
      error: null,
    });

    const result = await saveMyConcernResponseFeedback(supabase as never, {
      responseId: "response-1",
      concernAuthorProfileId: "author-1",
      liked: true,
      commentBody: "도움이 됐어요.",
    });

    expect(result).toBeUndefined();
    expect(from).toHaveBeenCalledWith("response_feedback");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      {
        response_id: "response-1",
        concern_author_profile_id: "author-1",
        liked: true,
        comment_body: "도움이 됐어요.",
      },
      {
        onConflict: "response_id,concern_author_profile_id",
      },
    );
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves through that same upsert path for a stale-baseline save without requiring create-vs-update branching", async () => {
    const { supabase, upsert } = createSupabaseMock({
      error: null,
    });

    await expect(
      saveMyConcernResponseFeedback(supabase as never, {
        responseId: "response-2",
        concernAuthorProfileId: "author-2",
        liked: false,
        commentBody: null,
      }),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith(
      {
        response_id: "response-2",
        concern_author_profile_id: "author-2",
        liked: false,
        comment_body: null,
      },
      {
        onConflict: "response_id,concern_author_profile_id",
      },
    );
  });

  it("throws the underlying error from the same upsert save path", async () => {
    const error = new Error("upsert failed");
    const { supabase, upsert } = createSupabaseMock({
      error,
    });

    await expect(
      saveMyConcernResponseFeedback(supabase as never, {
        responseId: "response-3",
        concernAuthorProfileId: "author-3",
        liked: true,
        commentBody: null,
      }),
    ).rejects.toThrow(error);

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
