import { describe, expect, it, vi } from "vitest";

import { submitResponseWithDependencies } from "./submit-response-service";

const DELIVERY_ID = "46d20512-0e94-4bca-95f7-c47003f87f1c";

describe("submitResponseWithDependencies", () => {
  it("returns profile_not_found before moderation or persistence when the profile row is missing", async () => {
    const moderateResponseBody = vi.fn();
    const persistResponseSubmission = vi.fn();

    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "충분히 긴 답변입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue(null),
        moderateResponseBody,
        persistResponseSubmission,
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
    expect(moderateResponseBody).not.toHaveBeenCalled();
    expect(persistResponseSubmission).not.toHaveBeenCalled();
  });

  it("maps a missing delivery to delivery_not_accessible", async () => {
    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "충분히 긴 답변입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_1" },
        }),
        persistResponseSubmission: vi.fn().mockResolvedValue({
          responseId: null,
          resultCode: "delivery_not_accessible",
          notificationCreated: false,
          concernSourceType: null,
          notifications: [],
        }),
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 404,
      body: {
        code: "delivery_not_accessible",
        userMessage: "대상 고민을 다시 확인해 주세요.",
      },
    });
  });

  it("maps another user's delivery to delivery_not_accessible", async () => {
    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "충분히 긴 답변입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_2" },
        }),
        persistResponseSubmission: vi.fn().mockResolvedValue({
          responseId: null,
          resultCode: "delivery_not_accessible",
          notificationCreated: false,
          concernSourceType: null,
          notifications: [],
        }),
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 404,
      body: {
        code: "delivery_not_accessible",
        userMessage: "대상 고민을 다시 확인해 주세요.",
      },
    });
  });

  it("maps an already responded delivery to delivery_already_responded", async () => {
    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "충분히 긴 답변입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_3" },
        }),
        persistResponseSubmission: vi.fn().mockResolvedValue({
          responseId: null,
          resultCode: "delivery_already_responded",
          notificationCreated: false,
          concernSourceType: "real",
          notifications: [],
        }),
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 409,
      body: {
        code: "delivery_already_responded",
        userMessage: "이미 답변을 제출한 고민입니다.",
      },
    });
  });

  it("routes blocked moderation results to audit-only persistence", async () => {
    const persistResponseSubmission = vi.fn().mockResolvedValue({
      responseId: null,
      resultCode: "blocked",
      notificationCreated: false,
      concernSourceType: "real",
      notifications: [],
    });

    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "  차단 대상 답변입니다.  " },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: true,
          categorySummary: {
            flagged_categories: ["violence"],
          },
          rawProviderPayload: { id: "modr_4" },
        }),
        persistResponseSubmission,
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
    expect(persistResponseSubmission).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      deliveryId: DELIVERY_ID,
      rawSubmittedText: "  차단 대상 답변입니다.  ",
      validatedBody: null,
      moderation: {
        blocked: true,
        categorySummary: {
          flagged_categories: ["violence"],
        },
        rawProviderPayload: { id: "modr_4" },
      },
    });
  });

  it("routes approved moderation results to response creation and linked notification persistence", async () => {
    const persistResponseSubmission = vi.fn().mockResolvedValue({
      responseId: "response-1",
      resultCode: "approved",
      notificationCreated: true,
      concernSourceType: "real",
      notifications: [
        {
          id: "notification-1",
          profileId: "profile-2",
          type: "response_received",
          relatedEntityType: "response",
          relatedEntityId: "response-1",
        },
      ],
    });

    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "  진심으로 응원하고 있어요.  " },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_5" },
        }),
        persistResponseSubmission,
      },
    );

    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      body: {
        status: "approved",
        responseId: "response-1",
      },
    });
    expect(persistResponseSubmission).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      deliveryId: DELIVERY_ID,
      rawSubmittedText: "  진심으로 응원하고 있어요.  ",
      validatedBody: "진심으로 응원하고 있어요.",
      moderation: {
        blocked: false,
        categorySummary: {
          flagged_categories: [],
        },
        rawProviderPayload: { id: "modr_5" },
      },
    });
  });

  it("maps duplicate/race persistence results to delivery_already_responded", async () => {
    const result = await submitResponseWithDependencies(
      {
        authUserId: "user-1",
        payload: { deliveryId: DELIVERY_ID, body: "충분히 긴 답변입니다." },
      },
      {
        resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
        moderateResponseBody: vi.fn().mockResolvedValue({
          blocked: false,
          categorySummary: {
            flagged_categories: [],
          },
          rawProviderPayload: { id: "modr_6" },
        }),
        persistResponseSubmission: vi.fn().mockResolvedValue({
          responseId: null,
          resultCode: "delivery_already_responded",
          notificationCreated: false,
          concernSourceType: "real",
          notifications: [],
        }),
      },
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 409,
      body: {
        code: "delivery_already_responded",
        userMessage: "이미 답변을 제출한 고민입니다.",
      },
    });
  });
});
