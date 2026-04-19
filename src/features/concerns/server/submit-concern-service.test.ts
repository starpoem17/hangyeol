import { describe, expect, it, vi } from "vitest";

import { submitConcernWithDependencies } from "./submit-concern-service";

describe("submitConcernWithDependencies", () => {
  it("returns profile_not_found before moderation or persistence when the profile row is missing", async () => {
    const moderateConcernBody = vi.fn();
    const persistBlockedConcernSubmission = vi.fn();
    const persistApprovedConcernSubmission = vi.fn();
    const selectResponderProfileIds = vi.fn();

    const result = await submitConcernWithDependencies(
      {
        authUserId: "user-1",
        payload: { body: "고민 내용" },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue(null),
        moderateConcernBody,
        persistBlockedConcernSubmission,
        persistApprovedConcernSubmission,
        selectResponderProfileIds,
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 409,
      body: {
        code: "profile_not_found",
        userMessage: "프로필 상태를 다시 확인해 주세요.",
      },
    });
    expect(moderateConcernBody).not.toHaveBeenCalled();
    expect(persistBlockedConcernSubmission).not.toHaveBeenCalled();
    expect(persistApprovedConcernSubmission).not.toHaveBeenCalled();
    expect(selectResponderProfileIds).not.toHaveBeenCalled();
  });

  it("routes blocked moderation results to audit-only persistence", async () => {
    const persistBlockedConcernSubmission = vi.fn().mockResolvedValue(undefined);
    const persistApprovedConcernSubmission = vi.fn();
    const selectResponderProfileIds = vi.fn();

    const result = await submitConcernWithDependencies(
      {
        authUserId: "user-1",
        payload: { body: "  차단 대상 고민  " },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateConcernBody: vi.fn().mockResolvedValue({
          blocked: true,
          categorySummary: {
            flagged_categories: ["violence"],
          },
          rawProviderPayload: { id: "modr_1" },
        }),
        persistBlockedConcernSubmission,
        persistApprovedConcernSubmission,
        selectResponderProfileIds,
      },
    );

    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      body: {
        status: "blocked",
        code: "moderation_blocked",
        userMessage: "부적절한 표현이 감지되었습니다.",
      },
    });
    expect(persistBlockedConcernSubmission).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      rawSubmittedText: "  차단 대상 고민  ",
      moderation: {
        blocked: true,
        categorySummary: {
          flagged_categories: ["violence"],
        },
        rawProviderPayload: { id: "modr_1" },
      },
    });
    expect(persistApprovedConcernSubmission).not.toHaveBeenCalled();
    expect(selectResponderProfileIds).not.toHaveBeenCalled();
  });

  it("routes approved moderation results to atomic concern creation with the exact selected responders", async () => {
    const persistBlockedConcernSubmission = vi.fn();
    const selectResponderProfileIds = vi.fn().mockResolvedValue([
      "responder-1",
      "responder-2",
      "responder-3",
    ]);
    const persistApprovedConcernSubmission = vi.fn().mockResolvedValue({
      concernId: "concern-1",
    });

    const result = await submitConcernWithDependencies(
      {
        authUserId: "user-1",
        payload: { body: "  승인 가능한 고민입니다. " },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateConcernBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_2" },
        }),
        persistBlockedConcernSubmission,
        persistApprovedConcernSubmission,
        selectResponderProfileIds,
      },
    );

    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      body: {
        status: "approved",
        concernId: "concern-1",
      },
    });
    expect(persistApprovedConcernSubmission).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      rawSubmittedText: "  승인 가능한 고민입니다. ",
      validatedBody: "승인 가능한 고민입니다.",
      responderProfileIds: ["responder-1", "responder-2", "responder-3"],
      moderation: {
        blocked: false,
        categorySummary: {
          flagged_categories: [],
        },
        rawProviderPayload: { id: "modr_2" },
      },
    });
    expect(persistBlockedConcernSubmission).not.toHaveBeenCalled();
    expect(selectResponderProfileIds).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      concernBody: "승인 가능한 고민입니다.",
    });
  });

  it("fails the request when recipient selection fails before any approved concern persistence", async () => {
    const persistApprovedConcernSubmission = vi.fn();

    const result = await submitConcernWithDependencies(
      {
        authUserId: "user-1",
        payload: { body: "승인 가능한 고민입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateConcernBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_3" },
        }),
        persistBlockedConcernSubmission: vi.fn(),
        persistApprovedConcernSubmission,
        selectResponderProfileIds: vi.fn().mockRejectedValue(new Error("routing failed")),
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 500,
      body: {
        code: "concern_submission_failed",
        userMessage: "게시를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    });
    expect(persistApprovedConcernSubmission).not.toHaveBeenCalled();
  });

  it("fails the request when the atomic approved concern write fails", async () => {
    await expect(
      submitConcernWithDependencies(
        {
          authUserId: "user-1",
          payload: { body: "승인 가능한 고민입니다." },
        },
        {
          resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
          moderateConcernBody: vi.fn().mockResolvedValue({
            blocked: false,
            categorySummary: {
              flagged_categories: [],
            },
            rawProviderPayload: { id: "modr_4" },
          }),
          persistBlockedConcernSubmission: vi.fn(),
          persistApprovedConcernSubmission: vi.fn().mockRejectedValue(new Error("write failed")),
          selectResponderProfileIds: vi.fn().mockResolvedValue(["responder-1", "responder-2", "responder-3"]),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      httpStatus: 500,
      body: {
        code: "concern_submission_failed",
        userMessage: "게시를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    });
  });
});
