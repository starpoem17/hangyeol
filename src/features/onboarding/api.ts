import type { AuthError, PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { GenderKey, InterestKey } from "./constants";

export type OnboardingRpcErrorTag =
  | "app_error:onboarding_missing_auth"
  | "app_error:onboarding_profile_missing"
  | "app_error:onboarding_empty_interests"
  | "app_error:onboarding_invalid_interests";

export type OnboardingRpcFailureKind = "validation" | "bootstrap_or_state_error";

export type OnboardingRpcFailure = {
  kind: OnboardingRpcFailureKind;
  tag: OnboardingRpcErrorTag | null;
  errorCode?: string;
  errorMessage?: string;
  userMessage: string;
};

type RpcErrorShape = Pick<PostgrestError, "code" | "details" | "message"> | Pick<AuthError, "code" | "message">;

const TAG_TO_FAILURE: Record<OnboardingRpcErrorTag, OnboardingRpcFailure> = {
  "app_error:onboarding_empty_interests": {
    kind: "validation",
    tag: "app_error:onboarding_empty_interests",
    userMessage: "관심 분야를 하나 이상 선택해 주세요.",
  },
  "app_error:onboarding_invalid_interests": {
    kind: "validation",
    tag: "app_error:onboarding_invalid_interests",
    userMessage: "허용되지 않은 관심 분야가 포함되어 있습니다.",
  },
  "app_error:onboarding_missing_auth": {
    kind: "bootstrap_or_state_error",
    tag: "app_error:onboarding_missing_auth",
    userMessage: "인증 상태를 다시 확인해 주세요.",
  },
  "app_error:onboarding_profile_missing": {
    kind: "bootstrap_or_state_error",
    tag: "app_error:onboarding_profile_missing",
    userMessage: "프로필 상태를 다시 확인해 주세요.",
  },
};

export function extractOnboardingErrorTag(error: RpcErrorShape): OnboardingRpcErrorTag | null {
  if ("details" in error && typeof error.details === "string" && error.details.startsWith("app_error:")) {
    return error.details as OnboardingRpcErrorTag;
  }

  return null;
}

export function interpretOnboardingRpcError(error: RpcErrorShape): OnboardingRpcFailure {
  const tag = extractOnboardingErrorTag(error);

  if (tag) {
    return {
      ...TAG_TO_FAILURE[tag],
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  return {
    kind: "bootstrap_or_state_error",
    tag: null,
    errorCode: error.code,
    errorMessage: error.message,
    userMessage: "상태를 확인하는 중 문제가 발생했습니다. 잠시 후 다시 확인해 주세요.",
  };
}

export async function completeOnboarding(
  supabase: SupabaseClient,
  input: { gender: GenderKey; interestKeys: InterestKey[] | string[] },
) {
  const { error } = await supabase.rpc("complete_onboarding", {
    p_gender: input.gender,
    p_interest_keys: input.interestKeys,
  });

  if (error) {
    throw interpretOnboardingRpcError(error);
  }
}
