import { describe, expect, it } from "vitest";

import {
  buildRoutingOpenAiInput,
  computeRequiredDeliveryCount,
  filterEligibleRoutingCandidates,
  isConcernAuthorRoutable,
  type RoutingAuthorRecord,
  type RoutingCandidatePoolRecord,
} from "./eligibility";

function buildAuthor(overrides: Partial<RoutingAuthorRecord> = {}): RoutingAuthorRecord {
  return {
    profileId: "0c72bb4f-6d69-4a63-bb13-8faf0c9a088c",
    onboardingCompleted: true,
    gender: "female",
    interests: ["study", "career_path"],
    isActive: true,
    isBlocked: false,
    ...overrides,
  };
}

function buildCandidate(overrides: Partial<RoutingCandidatePoolRecord> = {}): RoutingCandidatePoolRecord {
  return {
    profileId: "95b45404-97d6-4ae5-8574-f619da7e7f62",
    onboardingCompleted: true,
    gender: "male",
    interests: ["job_search", "study"],
    isActive: true,
    isBlocked: false,
    isConcernAuthor: false,
    alreadyAssigned: false,
    alreadyResponded: false,
    priorConcernBodies: ["첫 번째 고민", "두 번째 고민"],
    priorResponseBodies: ["첫 번째 답변", "두 번째 답변"],
    ...overrides,
  };
}

describe("eligibility helpers", () => {
  it("treats an active onboarded author with gender and interests as routable", () => {
    expect(isConcernAuthorRoutable(buildAuthor())).toBe(true);
    expect(isConcernAuthorRoutable(buildAuthor({ onboardingCompleted: false }))).toBe(false);
    expect(isConcernAuthorRoutable(buildAuthor({ gender: null }))).toBe(false);
    expect(isConcernAuthorRoutable(buildAuthor({ interests: [] }))).toBe(false);
    expect(isConcernAuthorRoutable(buildAuthor({ isActive: false }))).toBe(false);
    expect(isConcernAuthorRoutable(buildAuthor({ isBlocked: true }))).toBe(false);
  });

  it("filters out author, assigned, responded, blocked, inactive, and missing-attribute candidates", () => {
    const eligibleCandidate = buildCandidate();
    const candidates = [
      eligibleCandidate,
      buildCandidate({
        profileId: "95f2df5c-4cf3-4b33-b1e2-4986f63d7d3b",
        isConcernAuthor: true,
      }),
      buildCandidate({
        profileId: "4b3f2c49-f4fb-4548-9250-875bf0bcb8fa",
        alreadyAssigned: true,
      }),
      buildCandidate({
        profileId: "1c87308c-8d5d-4404-9ae7-4034b862d4e4",
        alreadyResponded: true,
      }),
      buildCandidate({
        profileId: "4181f46f-0a47-4f8b-a69b-c4bdaafdda72",
        isBlocked: true,
      }),
      buildCandidate({
        profileId: "39f21ea9-a982-4cd7-b123-97461d8c3f99",
        isActive: false,
      }),
      buildCandidate({
        profileId: "5a59fc79-b150-4bfd-8998-5e0eb49830f4",
        onboardingCompleted: false,
      }),
      buildCandidate({
        profileId: "07139f3d-b493-4f75-a4fe-517f71020c4a",
        gender: null,
      }),
      buildCandidate({
        profileId: "e43336a7-c4d0-4883-a2b2-b80939791de7",
        interests: [],
      }),
    ];

    expect(filterEligibleRoutingCandidates(candidates)).toEqual([
      {
        profileId: eligibleCandidate.profileId,
        gender: "male",
        interests: ["job_search", "study"],
        priorConcernBodies: ["첫 번째 고민", "두 번째 고민"],
        priorResponseBodies: ["첫 번째 답변", "두 번째 답변"],
      },
    ]);
  });

  it("computes exact delivery counts from the eligible pool size", () => {
    expect(computeRequiredDeliveryCount(0)).toBe(0);
    expect(computeRequiredDeliveryCount(1)).toBe(1);
    expect(computeRequiredDeliveryCount(2)).toBe(2);
    expect(computeRequiredDeliveryCount(3)).toBe(3);
    expect(computeRequiredDeliveryCount(8)).toBe(3);
  });

  it("assembles the OpenAI input with all prior concern and response bodies", () => {
    const input = buildRoutingOpenAiInput({
      author: buildAuthor({
        interests: ["career_path", "study", "career_path"],
      }),
      concernBody: "  지금 진로가 너무 고민돼요.  ",
      requiredDeliveryCount: 1,
      eligibleCandidates: filterEligibleRoutingCandidates([
        buildCandidate({
          interests: ["study", "job_search", "job_search"],
          priorConcernBodies: ["  첫 고민  ", "둘째 고민"],
          priorResponseBodies: ["첫 답변", " 둘째 답변 "],
        }),
      ]),
    });

    expect(input).toEqual({
      required_delivery_count: 1,
      concern_author: {
        gender: "female",
        interests: ["career_path", "study"],
        concern_body: "지금 진로가 너무 고민돼요.",
      },
      eligible_candidates: [
        {
          profile_id: "95b45404-97d6-4ae5-8574-f619da7e7f62",
          gender: "male",
          interests: ["job_search", "study"],
          prior_concern_bodies: ["첫 고민", "둘째 고민"],
          prior_response_bodies: ["첫 답변", "둘째 답변"],
        },
      ],
    });
  });
});
