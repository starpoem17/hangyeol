import {
  CANONICAL_INTEREST_KEY_SET,
  type CanonicalInterestKey,
} from "../domain/canonical-interest-keys.ts";

export type ProfileSummaryGender = "male" | "female";

type ProfileRow = {
  id: string;
  gender: ProfileSummaryGender | null;
  onboarding_completed: boolean;
};

type ProfileInterestRow = {
  interest_key: string;
};

export type ProfileSummary = {
  id: string;
  gender: ProfileSummaryGender | null;
  onboardingCompleted: boolean;
  interestKeys: CanonicalInterestKey[];
  solvedCount: number;
};

export type GetProfileSummaryDependencies = {
  loadProfileRow(authUserId: string): Promise<ProfileRow | null>;
  loadProfileInterests(profileId: string): Promise<ProfileInterestRow[]>;
  loadSolvedCount(profileId: string): Promise<unknown>;
};

function normalizeSolvedCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function mapInterestKeys(rows: ProfileInterestRow[]): CanonicalInterestKey[] {
  return rows
    .map((row) => row.interest_key)
    .filter((interestKey): interestKey is CanonicalInterestKey =>
      CANONICAL_INTEREST_KEY_SET.has(interestKey),
    );
}

export async function getProfileSummaryWithDependencies(
  authUserId: string,
  dependencies: GetProfileSummaryDependencies,
): Promise<ProfileSummary | null> {
  const profile = await dependencies.loadProfileRow(authUserId);

  if (!profile) {
    return null;
  }

  const [interestRows, solvedCount] = await Promise.all([
    dependencies.loadProfileInterests(profile.id),
    dependencies.loadSolvedCount(profile.id),
  ]);

  return {
    id: profile.id,
    gender: profile.gender,
    onboardingCompleted: profile.onboarding_completed,
    interestKeys: mapInterestKeys(interestRows),
    solvedCount: normalizeSolvedCount(solvedCount),
  };
}
