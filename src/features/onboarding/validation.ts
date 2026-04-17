import { z } from "zod";

import { CANONICAL_GENDERS, CANONICAL_INTEREST_KEY_SET } from "./constants";

export type OnboardingInput = {
  gender: string | null;
  interestKeys: string[];
};

type ValidationResult = {
  success: boolean;
  fieldErrors: {
    gender?: string;
    interestKeys?: string;
  };
};

const onboardingSchema = z.object({
  gender: z.string().nullable(),
  interestKeys: z.array(z.string()),
});

export function validateOnboardingInput(input: OnboardingInput): ValidationResult {
  const parsed = onboardingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      fieldErrors: {
        gender: "성별을 선택해 주세요.",
        interestKeys: "관심 분야를 하나 이상 선택해 주세요.",
      },
    };
  }

  const fieldErrors: ValidationResult["fieldErrors"] = {};

  if (!parsed.data.gender || !CANONICAL_GENDERS.includes(parsed.data.gender as (typeof CANONICAL_GENDERS)[number])) {
    fieldErrors.gender = "성별을 선택해 주세요.";
  }

  if (parsed.data.interestKeys.length === 0) {
    fieldErrors.interestKeys = "관심 분야를 하나 이상 선택해 주세요.";
  } else if (!parsed.data.interestKeys.every((interestKey) => CANONICAL_INTEREST_KEY_SET.has(interestKey))) {
    fieldErrors.interestKeys = "허용되지 않은 관심 분야가 포함되어 있습니다.";
  }

  return {
    success: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
