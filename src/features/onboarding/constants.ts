export const CANONICAL_GENDERS = ["male", "female"] as const;

export type GenderKey = (typeof CANONICAL_GENDERS)[number];

export const CANONICAL_INTERESTS = [
  { key: "job_search", labelKo: "취업" },
  { key: "career_path", labelKo: "진로" },
  { key: "study", labelKo: "학업" },
  { key: "exam", labelKo: "시험" },
  { key: "income", labelKo: "소득" },
  { key: "housing", labelKo: "주거" },
  { key: "romance", labelKo: "연애" },
  { key: "marriage", labelKo: "결혼" },
  { key: "parents", labelKo: "부모" },
  { key: "children", labelKo: "자녀" },
  { key: "depression", labelKo: "우울" },
  { key: "anxiety", labelKo: "불안" },
  { key: "loneliness", labelKo: "외로움" },
  { key: "workplace", labelKo: "직장" },
  { key: "work_life_balance", labelKo: "워라밸" },
  { key: "appearance", labelKo: "외모" },
  { key: "self_esteem", labelKo: "자존감" },
  { key: "health", labelKo: "건강" },
  { key: "retirement", labelKo: "노후" },
  { key: "future", labelKo: "미래" },
] as const;

export type InterestKey = (typeof CANONICAL_INTERESTS)[number]["key"];

export const CANONICAL_INTEREST_KEY_SET = new Set<string>(CANONICAL_INTERESTS.map((interest) => interest.key));
