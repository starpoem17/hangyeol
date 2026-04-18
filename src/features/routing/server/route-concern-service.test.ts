import { describe, expect, it, vi } from "vitest";

import { routeConcernWithDependencies } from "./route-concern-service";
import { buildRoutingCandidatePoolFromRows } from "./runtime-state";

function buildState(overrides: Partial<Awaited<ReturnType<typeof buildBaseState>>> = {}) {
  return {
    ...buildBaseState(),
    ...overrides,
  };
}

function buildBaseState() {
  return {
    concern: {
      id: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      sourceType: "real" as const,
      authorProfileId: "078c2183-d8f4-4f35-b56e-cd79ee6f1337",
      body: "저에게 맞는 방향을 모르겠어요.",
    },
    author: {
      profileId: "078c2183-d8f4-4f35-b56e-cd79ee6f1337",
      onboardingCompleted: true,
      gender: "female",
      interests: ["study"],
      isActive: true,
      isBlocked: false,
    },
    existingDeliveryCount: 0,
    candidatePool: [
      {
        profileId: "11913c12-9d5d-4e4f-878d-e2a0e8b2497d",
        onboardingCompleted: true,
        gender: "male",
        interests: ["study"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: false,
        alreadyResponded: false,
        priorConcernBodies: ["고민 1"],
        priorResponseBodies: ["답변 1"],
      },
      {
        profileId: "d96dd4e6-b6cc-41a9-91db-21be32fb85da",
        onboardingCompleted: true,
        gender: "female",
        interests: ["career_path"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: false,
        alreadyResponded: false,
        priorConcernBodies: ["고민 2"],
        priorResponseBodies: ["답변 2"],
      },
      {
        profileId: "89617967-fab4-445e-a20e-2e93eadc1d84",
        onboardingCompleted: true,
        gender: "male",
        interests: ["job_search"],
        isActive: true,
        isBlocked: false,
        isConcernAuthor: false,
        alreadyAssigned: false,
        alreadyResponded: false,
        priorConcernBodies: ["고민 3"],
        priorResponseBodies: ["답변 3"],
      },
    ],
  };
}

describe("routeConcernWithDependencies", () => {
  it("returns no_delivery without calling OpenAI when the eligible pool is empty", async () => {
    const selectResponderProfileIds = vi.fn();
    const createConcernDeliveries = vi.fn();

    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(
          buildState({
            candidatePool: [],
          }),
        ),
        selectResponderProfileIds,
        createConcernDeliveries,
      },
    );

    expect(result).toEqual({
      ok: true,
      status: "no_delivery",
      concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      eligibleCandidateCount: 0,
      deliveryCount: 0,
    });
    expect(selectResponderProfileIds).not.toHaveBeenCalled();
    expect(createConcernDeliveries).not.toHaveBeenCalled();
  });

  it("passes the exact ordered model output through to delivery creation when eligible pool is at least three", async () => {
    const createConcernDeliveries = vi.fn().mockResolvedValue(undefined);

    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(buildState()),
        selectResponderProfileIds: vi.fn().mockResolvedValue({
          ok: true,
          responderProfileIds: [
            "d96dd4e6-b6cc-41a9-91db-21be32fb85da",
            "11913c12-9d5d-4e4f-878d-e2a0e8b2497d",
            "89617967-fab4-445e-a20e-2e93eadc1d84",
          ],
        }),
        createConcernDeliveries,
      },
    );

    expect(result).toEqual({
      ok: true,
      status: "routed",
      concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      eligibleCandidateCount: 3,
      deliveryCount: 3,
    });
    expect(createConcernDeliveries).toHaveBeenCalledWith({
      concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      responderProfileIds: [
        "d96dd4e6-b6cc-41a9-91db-21be32fb85da",
        "11913c12-9d5d-4e4f-878d-e2a0e8b2497d",
        "89617967-fab4-445e-a20e-2e93eadc1d84",
      ],
    });
  });

  it("never tops off or mixes invalid model output", async () => {
    const createConcernDeliveries = vi.fn();

    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(buildState()),
        selectResponderProfileIds: vi.fn().mockResolvedValue({
          ok: false,
          code: "routing_output_invalid",
        }),
        createConcernDeliveries,
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "routing_output_invalid",
    });
    expect(createConcernDeliveries).not.toHaveBeenCalled();
  });

  it("excludes runtime-flagged assigned and responded candidates before OpenAI selection", async () => {
    const selectResponderProfileIds = vi.fn().mockResolvedValue({
      ok: true,
      responderProfileIds: ["33333333-3333-4333-8333-333333333333"],
    });

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
      ],
      interestsByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["study"]],
        ["22222222-2222-4222-8222-222222222222", ["career_path"]],
        ["33333333-3333-4333-8333-333333333333", ["job_search"]],
        ["078c2183-d8f4-4f35-b56e-cd79ee6f1337", ["study"]],
      ]),
      concernBodiesByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["고민 1"]],
        ["22222222-2222-4222-8222-222222222222", ["고민 2"]],
        ["33333333-3333-4333-8333-333333333333", ["고민 3"]],
      ]),
      responseBodiesByProfileId: new Map([
        ["11111111-1111-4111-8111-111111111111", ["답변 1"]],
        ["22222222-2222-4222-8222-222222222222", ["답변 2"]],
        ["33333333-3333-4333-8333-333333333333", ["답변 3"]],
      ]),
    });

    await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(
          buildState({
            candidatePool,
          }),
        ),
        selectResponderProfileIds,
        createConcernDeliveries: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(selectResponderProfileIds).toHaveBeenCalledWith({
      required_delivery_count: 1,
      concern_author: {
        gender: "female",
        interests: ["study"],
        concern_body: "저에게 맞는 방향을 모르겠어요.",
      },
      eligible_candidates: [
        {
          profile_id: "33333333-3333-4333-8333-333333333333",
          gender: "male",
          interests: ["job_search"],
          prior_concern_bodies: ["고민 3"],
          prior_response_bodies: ["답변 3"],
        },
      ],
    });
  });

  it("returns already_routed when the concern already has deliveries", async () => {
    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(
          buildState({
            existingDeliveryCount: 2,
          }),
        ),
        selectResponderProfileIds: vi.fn(),
        createConcernDeliveries: vi.fn(),
      },
    );

    expect(result).toEqual({
      ok: true,
      status: "already_routed",
      concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      deliveryCount: 2,
    });
  });

  it("rejects example concerns instead of treating them as fallback supply", async () => {
    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(
          buildState({
            concern: {
              id: "46d20512-0e94-4bca-95f7-c47003f87f1c",
              sourceType: "example",
              authorProfileId: null,
              body: "예제 고민",
            },
          }),
        ),
        selectResponderProfileIds: vi.fn(),
        createConcernDeliveries: vi.fn(),
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "concern_not_real",
    });
  });

  it("maps delivery write failures to delivery_creation_failed", async () => {
    const result = await routeConcernWithDependencies(
      {
        concernId: "46d20512-0e94-4bca-95f7-c47003f87f1c",
      },
      {
        loadConcernRoutingState: vi.fn().mockResolvedValue(
          buildState({
            candidatePool: [buildBaseState().candidatePool[0]],
          }),
        ),
        selectResponderProfileIds: vi.fn().mockResolvedValue({
          ok: true,
          responderProfileIds: ["11913c12-9d5d-4e4f-878d-e2a0e8b2497d"],
        }),
        createConcernDeliveries: vi.fn().mockRejectedValue(new Error("insert failed")),
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "delivery_creation_failed",
    });
  });
});
