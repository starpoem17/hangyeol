import { describe, expect, it } from "vitest";

import { MAX_RESPONSE_BODY_LENGTH } from "./contracts";
import { validateSubmitResponsePayload } from "./validation";

const DELIVERY_ID = "46d20512-0e94-4bca-95f7-c47003f87f1c";

describe("validateSubmitResponsePayload", () => {
  it("rejects an invalid UUID delivery id", () => {
    expect(
      validateSubmitResponsePayload({
        deliveryId: "not-a-uuid",
        body: "유효한 답변입니다.",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "invalid_delivery_id",
        userMessage: "대상 고민을 다시 확인해 주세요.",
      },
    });
  });

  it("rejects a whitespace-only body", () => {
    expect(
      validateSubmitResponsePayload({
        deliveryId: DELIVERY_ID,
        body: "   ",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "empty_body",
        userMessage: "답변 내용을 입력해 주세요.",
      },
    });
  });

  it("rejects an under-5-char trimmed body", () => {
    expect(
      validateSubmitResponsePayload({
        deliveryId: DELIVERY_ID,
        body: "  응원  ",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "body_too_short",
        userMessage: "답변 내용은 5자 이상 입력해 주세요.",
      },
    });
  });

  it("rejects a body above the 2000-char limit", () => {
    expect(
      validateSubmitResponsePayload({
        deliveryId: DELIVERY_ID,
        body: "가".repeat(MAX_RESPONSE_BODY_LENGTH + 1),
      }),
    ).toEqual({
      success: false,
      error: {
        code: "body_too_long",
        userMessage: `답변 내용은 ${MAX_RESPONSE_BODY_LENGTH}자 이하로 입력해 주세요.`,
      },
    });
  });

  it("accepts a valid body and returns its trimmed form", () => {
    expect(
      validateSubmitResponsePayload({
        deliveryId: DELIVERY_ID,
        body: "  진심으로 응원하고 있어요.  ",
      }),
    ).toEqual({
      success: true,
      data: {
        deliveryId: DELIVERY_ID,
        rawBody: "  진심으로 응원하고 있어요.  ",
        trimmedBody: "진심으로 응원하고 있어요.",
      },
    });
  });
});
