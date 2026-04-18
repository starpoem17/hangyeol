export type ModerationCategorySummary = {
  flagged_categories: string[];
};

export type ModerationDecision = {
  blocked: boolean;
  categorySummary: ModerationCategorySummary;
  rawProviderPayload: unknown;
};

type ModerationResultShape = {
  flagged?: unknown;
  categories?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFirstModerationResult(payload: unknown): ModerationResultShape {
  if (!isRecord(payload) || !Array.isArray(payload.results) || payload.results.length === 0 || !isRecord(payload.results[0])) {
    throw new Error("invalid moderation response");
  }

  return payload.results[0];
}

export function normalizeModerationResponse(payload: unknown): ModerationDecision {
  const result = getFirstModerationResult(payload);

  if (!isRecord(result.categories)) {
    throw new Error("invalid moderation categories");
  }

  const flaggedCategories = Object.entries(result.categories)
    .filter(([, value]) => value === true)
    .map(([category]) => category)
    .sort((left, right) => left.localeCompare(right));

  return {
    blocked: result.flagged === true || flaggedCategories.length > 0,
    categorySummary: {
      flagged_categories: flaggedCategories,
    },
    rawProviderPayload: payload,
  };
}
