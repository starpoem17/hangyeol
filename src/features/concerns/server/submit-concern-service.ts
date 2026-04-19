import {
  AUTH_REQUIRED_MESSAGE,
  CONCERN_BLOCKED_MESSAGE,
  PROFILE_NOT_FOUND_MESSAGE,
  SUBMIT_CONCERN_RETRY_MESSAGE,
  type SubmitConcernErrorResponse,
  type SubmitConcernSuccessResponse,
} from "../contracts.ts";
import { validateSubmitConcernPayload } from "../validation.ts";
import type { ModerationDecision } from "./moderation.ts";

export type SubmitConcernServiceResult =
  | {
      ok: true;
      httpStatus: 200;
      body: SubmitConcernSuccessResponse;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 409 | 500 | 502;
      body: SubmitConcernErrorResponse;
    };

export type SubmitConcernServiceInput = {
  authUserId: string;
  payload: unknown;
};

export type PersistBlockedConcernInput = {
  actorProfileId: string;
  rawSubmittedText: string;
  moderation: ModerationDecision;
};

export type PersistApprovedConcernInput = PersistBlockedConcernInput & {
  validatedBody: string;
};

export type RouteApprovedConcernInput = {
  concernId: string;
};

export type SubmitConcernServiceDependencies = {
  resolveProfileId(authUserId: string): Promise<string | null>;
  moderateConcernBody(rawBody: string): Promise<ModerationDecision>;
  persistBlockedConcernSubmission(input: PersistBlockedConcernInput): Promise<void>;
  persistApprovedConcernSubmission(input: PersistApprovedConcernInput): Promise<{ concernId: string }>;
  routeApprovedConcernSubmission?(input: RouteApprovedConcernInput): Promise<void>;
};

function isRoutingInvariantError(error: unknown) {
  return error instanceof Error && error.message === "routing invariant breach: concern_not_real";
}

function buildError(httpStatus: 400 | 401 | 409 | 500 | 502, body: SubmitConcernErrorResponse): SubmitConcernServiceResult {
  return {
    ok: false,
    httpStatus,
    body,
  };
}

export async function submitConcernWithDependencies(
  input: SubmitConcernServiceInput,
  dependencies: SubmitConcernServiceDependencies,
): Promise<SubmitConcernServiceResult> {
  if (!input.authUserId) {
    return buildError(401, {
      code: "auth_required",
      userMessage: AUTH_REQUIRED_MESSAGE,
    });
  }

  let actorProfileId: string | null;

  try {
    actorProfileId = await dependencies.resolveProfileId(input.authUserId);
  } catch {
    return buildError(500, {
      code: "concern_submission_failed",
      userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
    });
  }

  if (!actorProfileId) {
    // The request is authenticated and well-formed, but it conflicts with the
    // app invariant that every auth user should already have a profiles row.
    return buildError(409, {
      code: "profile_not_found",
      userMessage: PROFILE_NOT_FOUND_MESSAGE,
    });
  }

  const validation = validateSubmitConcernPayload(input.payload);

  if (!validation.success) {
    return buildError(400, validation.error);
  }

  let moderation: ModerationDecision;

  try {
    moderation = await dependencies.moderateConcernBody(validation.data.rawBody);
  } catch {
    return buildError(502, {
      code: "moderation_unavailable",
      userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
    });
  }

  try {
    if (moderation.blocked) {
      await dependencies.persistBlockedConcernSubmission({
        actorProfileId,
        rawSubmittedText: validation.data.rawBody,
        moderation,
      });

      return {
        ok: true,
        httpStatus: 200,
        body: {
          status: "blocked",
          code: "moderation_blocked",
          userMessage: CONCERN_BLOCKED_MESSAGE,
        },
      };
    }

    const { concernId } = await dependencies.persistApprovedConcernSubmission({
      actorProfileId,
      rawSubmittedText: validation.data.rawBody,
      validatedBody: validation.data.trimmedBody,
      moderation,
    });

    try {
      await dependencies.routeApprovedConcernSubmission?.({
        concernId,
      });
    } catch (error) {
      if (isRoutingInvariantError(error)) {
        throw error;
      }

      // Routing runs as a best-effort backend consequence in Phase 4.
      // The approved concern row must still be returned to the caller.
    }

    return {
      ok: true,
      httpStatus: 200,
      body: {
        status: "approved",
        concernId,
      },
    };
  } catch {
    return buildError(500, {
      code: "concern_submission_failed",
      userMessage: SUBMIT_CONCERN_RETRY_MESSAGE,
    });
  }
}
