import type { AuthError, PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import {
  CANONICAL_INTEREST_KEY_SET,
  type GenderKey,
  type InterestKey,
} from "../onboarding/constants";

type ProfileRow = {
  id: string;
  gender: GenderKey | null;
  onboarding_completed: boolean;
};

type ProfileInterestRow = {
  interest_key: string;
};

type RpcErrorShape = Pick<PostgrestError, "code" | "details" | "message"> | Pick<AuthError, "code" | "message">;

export type UpdateMyProfileInterestsErrorTag =
  | "app_error:profile_interests_missing_auth"
  | "app_error:profile_interests_profile_missing"
  | "app_error:profile_interests_empty"
  | "app_error:profile_interests_invalid";

export type UpdateMyProfileInterestsFailure = {
  kind: "validation" | "bootstrap_or_state_error";
  tag: UpdateMyProfileInterestsErrorTag | null;
  errorCode?: string;
  errorMessage?: string;
  userMessage: string;
};

export type MyProfileSummary = {
  id: string;
  gender: GenderKey | null;
  onboardingCompleted: boolean;
  interestKeys: InterestKey[];
  solvedCount: number;
};

const UPDATE_INTEREST_FAILURES: Record<UpdateMyProfileInterestsErrorTag, UpdateMyProfileInterestsFailure> = {
  "app_error:profile_interests_empty": {
    kind: "validation",
    tag: "app_error:profile_interests_empty",
    userMessage: "관심 분야를 하나 이상 선택해 주세요.",
  },
  "app_error:profile_interests_invalid": {
    kind: "validation",
    tag: "app_error:profile_interests_invalid",
    userMessage: "허용되지 않은 관심 분야가 포함되어 있습니다.",
  },
  "app_error:profile_interests_missing_auth": {
    kind: "bootstrap_or_state_error",
    tag: "app_error:profile_interests_missing_auth",
    userMessage: "인증 상태를 다시 확인해 주세요.",
  },
  "app_error:profile_interests_profile_missing": {
    kind: "bootstrap_or_state_error",
    tag: "app_error:profile_interests_profile_missing",
    userMessage: "프로필 상태를 다시 확인해 주세요.",
  },
};

function extractUpdateMyProfileInterestsErrorTag(error: RpcErrorShape): UpdateMyProfileInterestsErrorTag | null {
  if ("details" in error && typeof error.details === "string" && error.details.startsWith("app_error:")) {
    return error.details as UpdateMyProfileInterestsErrorTag;
  }

  return null;
}

function interpretUpdateMyProfileInterestsError(error: RpcErrorShape): UpdateMyProfileInterestsFailure {
  const tag = extractUpdateMyProfileInterestsErrorTag(error);

  if (tag) {
    return {
      ...UPDATE_INTEREST_FAILURES[tag],
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  return {
    kind: "bootstrap_or_state_error",
    tag: null,
    errorCode: error.code,
    errorMessage: error.message,
    userMessage: "프로필 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}

function normalizeSolvedCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function mapInterestKeys(rows: ProfileInterestRow[] | null | undefined): InterestKey[] {
  return (rows ?? [])
    .map((row) => row.interest_key)
    .filter((interestKey): interestKey is InterestKey => CANONICAL_INTEREST_KEY_SET.has(interestKey));
}

export async function getMyProfileSummary(supabase: SupabaseClient): Promise<MyProfileSummary | null> {
  const [profileResult, interestsResult, solvedCountResult] = await Promise.all([
    supabase.from("profiles").select("id, gender, onboarding_completed").maybeSingle(),
    supabase.from("profile_interests").select("interest_key").order("interest_key", { ascending: true }),
    supabase.rpc("get_my_solved_count"),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (interestsResult.error) {
    throw interestsResult.error;
  }

  if (solvedCountResult.error) {
    throw solvedCountResult.error;
  }

  const row = profileResult.data as ProfileRow | null;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    gender: row.gender,
    onboardingCompleted: row.onboarding_completed,
    interestKeys: mapInterestKeys(interestsResult.data as ProfileInterestRow[] | null | undefined),
    solvedCount: normalizeSolvedCount(solvedCountResult.data),
  };
}

export async function updateMyProfileInterests(
  supabase: SupabaseClient,
  input: {
    interestKeys: InterestKey[] | string[];
  },
) {
  const { error } = await supabase.rpc("update_my_profile_interests", {
    p_interest_keys: input.interestKeys,
  });

  if (error) {
    throw interpretUpdateMyProfileInterestsError(error);
  }
}
