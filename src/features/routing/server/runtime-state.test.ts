import { describe, expect, it, vi } from "vitest";

import { buildRoutingCandidatePoolFromRows, loadConcernRoutingState, type ServiceClientLike } from "./runtime-state";

describe("runtime routing state", () => {
  it("derives alreadyAssigned and alreadyResponded from same-concern DB rows", () => {
    const candidatePool = buildRoutingCandidatePoolFromRows({
      candidateProfiles: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          onboarding_completed: true,
          gender: "male",
          is_active: true,
          is_blocked: false,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          onboarding_completed: true,
          gender: "female",
          is_active: true,
          is_blocked: false,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          onboarding_completed: true,
          gender: "male",
          is_active: true,
          is_blocked: false,
        },
      ],
      sameConcernDeliveries: [
        {
          id: "delivery-1",
          recipient_profile_id: "11111111-1111-4111-8111-111111111111",
        },
        {
          id: "delivery-2",
          recipient_profile_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
      sameConcernResponses: [
        {
          delivery_id: "delivery-2",
        },
        {
          delivery_id: "unrelated-delivery",
        },
      ],
      interestsByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["study"]],
        ["22222222-2222-4222-8222-222222222222", ["career_path"]],
        ["33333333-3333-4333-8333-333333333333", ["job_search"]],
      ]),
      concernBodiesByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["고민 1"]],
        ["22222222-2222-4222-8222-222222222222", ["고민 2"]],
      ]),
      responseBodiesByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["답변 1"]],
        ["22222222-2222-4222-8222-222222222222", ["답변 2"]],
      ]),
    });

    expect(candidatePool).toEqual([
      {
        profileId: "11111111-1111-4111-8111-111111111111",
        onboardingCompleted: true,
        gender: "male",
        interests: ["study"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: true,
        alreadyResponded: false,
        priorConcernBodies: ["고민 1"],
        priorResponseBodies: ["답변 1"],
      },
      {
        profileId: "22222222-2222-4222-8222-222222222222",
        onboardingCompleted: true,
        gender: "female",
        interests: ["career_path"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: true,
        alreadyResponded: true,
        priorConcernBodies: ["고민 2"],
        priorResponseBodies: ["답변 2"],
      },
      {
        profileId: "33333333-3333-4333-8333-333333333333",
        onboardingCompleted: true,
        gender: "male",
        interests: ["job_search"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: false,
        alreadyResponded: false,
        priorConcernBodies: [],
        priorResponseBodies: [],
      },
    ]);
  });

  it("preserves the early short-circuit for concerns that are already routed", async () => {
    const serviceClient: ServiceClientLike = {
      from: vi.fn((table: string) => ({
        select: (query: string) => {
          if (table === "concerns" && query === "id, source_type, author_profile_id, body") {
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "46d20512-0e94-4bca-95f7-c47003f87f1c",
                    source_type: "real",
                    author_profile_id: "078c2183-d8f4-4f35-b56e-cd79ee6f1337",
                    body: "이미 라우팅된 고민",
                  },
                  error: null,
                }),
              }),
            };
          }

          if (table === "concern_deliveries" && query === "id, recipient_profile_id") {
            return {
              eq: async () => ({
                data: [
                  {
                    id: "existing-delivery-1",
                    recipient_profile_id: "11111111-1111-4111-8111-111111111111",
                  },
                ],
                error: null,
              }),
            };
          }

          throw new Error(`Unexpected query: ${table} ${query}`);
        },
      })),
    };

    const result = await loadConcernRoutingState(serviceClient, "46d20512-0e94-4bca-95f7-c47003f87f1c");

    expect(result).toEqual({
      concern: {
        id: "46d20512-0e94-4bca-95f7-c47003f87f1c",
        sourceType: "real",
        authorProfileId: "078c2183-d8f4-4f35-b56e-cd79ee6f1337",
        body: "이미 라우팅된 고민",
      },
      author: null,
      existingDeliveryCount: 1,
      candidatePool: [],
    });
    expect((serviceClient.from as ReturnType<typeof vi.fn>).mock.calls).toEqual([["concerns"], ["concern_deliveries"]]);
  });
});
