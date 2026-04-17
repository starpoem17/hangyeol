import { describe, expect, it } from "vitest";

import { validateOnboardingInput } from "./validation";

describe("validateOnboardingInput", () => {
  it("accepts valid canonical input", () => {
    expect(
      validateOnboardingInput({
        gender: "male",
        interestKeys: ["job_search", "future"],
      }),
    ).toEqual({
      success: true,
      fieldErrors: {},
    });
  });

  it("requires gender", () => {
    expect(
      validateOnboardingInput({
        gender: null,
        interestKeys: ["job_search"],
      }),
    ).toEqual({
      success: false,
      fieldErrors: {
        gender: "성별을 선택해 주세요.",
      },
    });
  });

  it("requires at least one interest", () => {
    expect(
      validateOnboardingInput({
        gender: "female",
        interestKeys: [],
      }),
    ).toEqual({
      success: false,
      fieldErrors: {
        interestKeys: "관심 분야를 하나 이상 선택해 주세요.",
      },
    });
  });

  it("rejects invalid interest keys", () => {
    expect(
      validateOnboardingInput({
        gender: "female",
        interestKeys: ["invalid_interest"],
      }),
    ).toEqual({
      success: false,
      fieldErrors: {
        interestKeys: "허용되지 않은 관심 분야가 포함되어 있습니다.",
      },
    });
  });

  it("does not fail solely because duplicate keys exist", () => {
    expect(
      validateOnboardingInput({
        gender: "male",
        interestKeys: ["job_search", "job_search"],
      }),
    ).toEqual({
      success: true,
      fieldErrors: {},
    });
  });
});
