import { OpenAiRoutingInputSchema, RoutingAuthorSnapshotSchema, RoutingCandidateSnapshotSchema, type OpenAiRoutingInput } from "../contracts";

export type RoutingAuthorRecord = {
  profileId: string;
  onboardingCompleted: boolean;
  gender: string | null;
  interests: string[];
  isActive: boolean;
  isBlocked: boolean;
};

export type RoutingCandidatePoolRecord = {
  profileId: string;
  onboardingCompleted: boolean;
  gender: string | null;
  interests: string[];
  isActive: boolean;
  isBlocked: boolean;
  isConcernAuthor: boolean;
  alreadyAssigned: boolean;
  alreadyResponded: boolean;
  priorConcernBodies: string[];
  priorResponseBodies: string[];
};

export type EligibleRoutingCandidateRecord = {
  profileId: string;
  gender: string;
  interests: string[];
  priorConcernBodies: string[];
  priorResponseBodies: string[];
};

function sortUniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeBodies(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

export function hasRequiredRoutingAttributes(input: {
  onboardingCompleted: boolean;
  gender: string | null;
  interests: string[];
}) {
  return input.onboardingCompleted && input.gender !== null && sortUniqueStrings(input.interests).length > 0;
}

export function isConcernAuthorRoutable(author: RoutingAuthorRecord | null) {
  if (!author) {
    return false;
  }

  return author.isActive && !author.isBlocked && hasRequiredRoutingAttributes(author);
}

export function filterEligibleRoutingCandidates(candidates: RoutingCandidatePoolRecord[]) {
  return candidates
    .filter((candidate) => {
      return (
        !candidate.isConcernAuthor &&
        !candidate.alreadyAssigned &&
        !candidate.alreadyResponded &&
        candidate.isActive &&
        !candidate.isBlocked &&
        hasRequiredRoutingAttributes(candidate)
      );
    })
    .map((candidate) => ({
      profileId: candidate.profileId,
      gender: candidate.gender as string,
      interests: sortUniqueStrings(candidate.interests),
      priorConcernBodies: normalizeBodies(candidate.priorConcernBodies),
      priorResponseBodies: normalizeBodies(candidate.priorResponseBodies),
    }));
}

export function computeRequiredDeliveryCount(eligibleCandidateCount: number): 0 | 1 | 2 | 3 {
  if (eligibleCandidateCount <= 0) {
    return 0;
  }

  if (eligibleCandidateCount === 1) {
    return 1;
  }

  if (eligibleCandidateCount === 2) {
    return 2;
  }

  return 3;
}

export function buildRoutingOpenAiInput(input: {
  author: RoutingAuthorRecord;
  concernBody: string;
  eligibleCandidates: EligibleRoutingCandidateRecord[];
  requiredDeliveryCount: 1 | 2 | 3;
}): OpenAiRoutingInput {
  const author = RoutingAuthorSnapshotSchema.parse({
    gender: input.author.gender,
    interests: sortUniqueStrings(input.author.interests),
    concern_body: input.concernBody.trim(),
  });

  const eligibleCandidates = input.eligibleCandidates.map((candidate) =>
    RoutingCandidateSnapshotSchema.parse({
      profile_id: candidate.profileId,
      gender: candidate.gender,
      interests: sortUniqueStrings(candidate.interests),
      prior_concern_bodies: normalizeBodies(candidate.priorConcernBodies),
      prior_response_bodies: normalizeBodies(candidate.priorResponseBodies),
    }),
  );

  return OpenAiRoutingInputSchema.parse({
    required_delivery_count: input.requiredDeliveryCount,
    concern_author: author,
    eligible_candidates: eligibleCandidates,
  });
}
