export const CANONICAL_INTEREST_KEYS = [
  "job_search",
  "career_path",
  "study",
  "exam",
  "income",
  "housing",
  "romance",
  "marriage",
  "parents",
  "children",
  "depression",
  "anxiety",
  "loneliness",
  "workplace",
  "work_life_balance",
  "appearance",
  "self_esteem",
  "health",
  "retirement",
  "future",
] as const;

export type CanonicalInterestKey = (typeof CANONICAL_INTEREST_KEYS)[number];

export const CANONICAL_INTEREST_KEY_SET = new Set<string>(CANONICAL_INTEREST_KEYS);
