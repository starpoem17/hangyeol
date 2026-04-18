import { describe, expect, it } from "vitest";

import { MAX_CONCERN_BODY_LENGTH } from "./contracts";
import { validateSubmitConcernPayload } from "./validation";

describe("validateSubmitConcernPayload", () => {
  it("accepts a valid concern body and returns its trimmed form", () => {
    expect(
      validateSubmitConcernPayload({
        body: "  고민 내용을 적습니다.  ",
      }),
    ).toEqual({
      success: true,
      data: {
        rawBody: "  고민 내용을 적습니다.  ",
        trimmedBody: "고민 내용을 적습니다.",
      },
    });
  });

  it("rejects a missing or non-object payload", () => {
    expect(validateSubmitConcernPayload(null)).toEqual({
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: "고민 내용을 다시 확인해 주세요.",
      },
    });
  });

  it("rejects a non-string body", () => {
    expect(
      validateSubmitConcernPayload({
        body: 1234,
      }),
    ).toEqual({
      success: false,
      error: {
        code: "invalid_body_type",
        userMessage: "고민 내용을 다시 확인해 주세요.",
      },
    });
  });

  it("rejects a whitespace-only body", () => {
    expect(
      validateSubmitConcernPayload({
        body: "   ",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "empty_body",
        userMessage: "고민 내용을 입력해 주세요.",
      },
    });
  });

  it("rejects a body that exceeds the server-side length guard", () => {
    expect(
      validateSubmitConcernPayload({
        body: "가".repeat(MAX_CONCERN_BODY_LENGTH + 1),
      }),
    ).toEqual({
      success: false,
      error: {
        code: "body_too_long",
        userMessage: `고민 내용은 ${MAX_CONCERN_BODY_LENGTH}자 이하로 입력해 주세요.`,
      },
    });
  });
});
