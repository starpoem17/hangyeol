import { RouteConcernRequestSchema, type OpenAiRoutingInput, type RouteConcernFailureCode } from "../contracts.ts";
import {
  buildRoutingOpenAiInput,
  computeRequiredDeliveryCount,
  filterEligibleRoutingCandidates,
  isConcernAuthorRoutable,
  type RoutingAuthorRecord,
  type RoutingCandidatePoolRecord,
} from "./eligibility.ts";

type ConcernRecord = {
  id: string;
  sourceType: "real" | "example";
  authorProfileId: string | null;
  body: string;
};

type RouteConcernState = {
  concern: ConcernRecord | null;
  author: RoutingAuthorRecord | null;
  existingDeliveryCount: number;
  candidatePool: RoutingCandidatePoolRecord[];
};

export type RouteConcernSuccessResult =
  | {
      ok: true;
      status: "no_delivery";
      concernId: string;
      eligibleCandidateCount: 0;
      deliveryCount: 0;
    }
  | {
      ok: true;
      status: "already_routed";
      concernId: string;
      deliveryCount: number;
    }
  | {
      ok: true;
      status: "routed";
      concernId: string;
      eligibleCandidateCount: number;
      deliveryCount: number;
    };

export type RouteConcernFailureResult = {
  ok: false;
  code: RouteConcernFailureCode;
};

export type RouteConcernServiceResult = RouteConcernSuccessResult | RouteConcernFailureResult;

type RouteConcernLogEvent =
  | "routing_requested"
  | "routing_eligible_pool_computed"
  | "routing_required_count_computed"
  | "routing_openai_started"
  | "routing_openai_succeeded"
  | "routing_openai_failed"
  | "routing_output_validated"
  | "routing_output_invalid"
  | "routing_delivery_created"
  | "routing_delivery_failed";

export type RouteConcernLogPayload = {
  event: RouteConcernLogEvent;
  concernId: string;
  authorProfileId?: string | null;
  eligibleCandidateCount?: number;
  requiredDeliveryCount?: number;
  outputCount?: number;
  errorCode?: RouteConcernFailureCode;
  errorMessage?: string;
};

export type RouteConcernServiceDependencies = {
  loadConcernRoutingState(concernId: string): Promise<RouteConcernState | null>;
  selectResponderProfileIds(input: OpenAiRoutingInput): Promise<
    | {
        ok: true;
        responderProfileIds: string[];
      }
    | {
        ok: false;
        code: RouteConcernFailureCode;
      }
  >;
  createConcernDeliveries(input: { concernId: string; responderProfileIds: string[] }): Promise<void>;
  logInfo?(payload: RouteConcernLogPayload): void;
  logError?(payload: RouteConcernLogPayload): void;
};

function logInfo(dependencies: RouteConcernServiceDependencies, payload: RouteConcernLogPayload) {
  dependencies.logInfo?.(payload);
}

function logError(dependencies: RouteConcernServiceDependencies, payload: RouteConcernLogPayload) {
  dependencies.logError?.(payload);
}

function buildFailure(code: RouteConcernFailureCode): RouteConcernFailureResult {
  return {
    ok: false,
    code,
  };
}

export async function routeConcernWithDependencies(
  input: { concernId: string },
  dependencies: RouteConcernServiceDependencies,
): Promise<RouteConcernServiceResult> {
  const request = RouteConcernRequestSchema.parse(input);

  logInfo(dependencies, {
    event: "routing_requested",
    concernId: request.concernId,
  });

  const state = await dependencies.loadConcernRoutingState(request.concernId);

  if (!state || !state.concern) {
    return buildFailure("concern_not_found");
  }

  if (state.concern.sourceType !== "real") {
    return buildFailure("concern_not_real");
  }

  if (state.existingDeliveryCount > 0) {
    return {
      ok: true,
      status: "already_routed",
      concernId: request.concernId,
      deliveryCount: state.existingDeliveryCount,
    };
  }

  if (!isConcernAuthorRoutable(state.author)) {
    return buildFailure("concern_author_not_routable");
  }

  const eligibleCandidates = filterEligibleRoutingCandidates(state.candidatePool);

  logInfo(dependencies, {
    event: "routing_eligible_pool_computed",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
  });

  const requiredDeliveryCount = computeRequiredDeliveryCount(eligibleCandidates.length);

  logInfo(dependencies, {
    event: "routing_required_count_computed",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
  });

  if (requiredDeliveryCount === 0) {
    return {
      ok: true,
      status: "no_delivery",
      concernId: request.concernId,
      eligibleCandidateCount: 0,
      deliveryCount: 0,
    };
  }

  const openAiInput = buildRoutingOpenAiInput({
    author: state.author,
    concernBody: state.concern.body,
    eligibleCandidates,
    requiredDeliveryCount,
  });

  logInfo(dependencies, {
    event: "routing_openai_started",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
  });

  const selection = await dependencies.selectResponderProfileIds(openAiInput);

  if (!selection.ok) {
    logError(dependencies, {
      event: "routing_openai_failed",
      concernId: request.concernId,
      authorProfileId: state.concern.authorProfileId,
      eligibleCandidateCount: eligibleCandidates.length,
      requiredDeliveryCount,
      errorCode: selection.code,
    });

    if (selection.code !== "routing_unavailable") {
      logError(dependencies, {
        event: "routing_output_invalid",
        concernId: request.concernId,
        authorProfileId: state.concern.authorProfileId,
        eligibleCandidateCount: eligibleCandidates.length,
        requiredDeliveryCount,
        errorCode: selection.code,
      });
    }

    return selection;
  }

  logInfo(dependencies, {
    event: "routing_openai_succeeded",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
    outputCount: selection.responderProfileIds.length,
  });

  logInfo(dependencies, {
    event: "routing_output_validated",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
    outputCount: selection.responderProfileIds.length,
  });

  try {
    await dependencies.createConcernDeliveries({
      concernId: request.concernId,
      responderProfileIds: selection.responderProfileIds,
    });
  } catch (error) {
    logError(dependencies, {
      event: "routing_delivery_failed",
      concernId: request.concernId,
      authorProfileId: state.concern.authorProfileId,
      eligibleCandidateCount: eligibleCandidates.length,
      requiredDeliveryCount,
      outputCount: selection.responderProfileIds.length,
      errorCode: "delivery_creation_failed",
      errorMessage: error instanceof Error ? error.message : "unknown routing delivery failure",
    });

    return buildFailure("delivery_creation_failed");
  }

  logInfo(dependencies, {
    event: "routing_delivery_created",
    concernId: request.concernId,
    authorProfileId: state.concern.authorProfileId,
    eligibleCandidateCount: eligibleCandidates.length,
    requiredDeliveryCount,
    outputCount: selection.responderProfileIds.length,
  });

  return {
    ok: true,
    status: "routed",
    concernId: request.concernId,
    eligibleCandidateCount: eligibleCandidates.length,
    deliveryCount: selection.responderProfileIds.length,
  };
}
