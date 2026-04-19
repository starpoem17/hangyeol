import type { PhaseProfile } from "@/features/session/gate";

export const PUSH_REGISTRATION_COOLDOWN_MS = 30_000;

type RevalidationReason = "session" | "foreground";
export type PushRegistrationRevalidationRun = {
  runId: number;
  userId: string;
};

export type PushRegistrationProfileRow = {
  id: string;
  gender: PhaseProfile["gender"];
  onboarding_completed: boolean;
};

export function mapPushRegistrationProfile(row: PushRegistrationProfileRow): PhaseProfile {
  return {
    id: row.id,
    gender: row.gender,
    onboardingCompleted: row.onboarding_completed,
  };
}

export function createPushRegistrationRevalidationController(cooldownMs = PUSH_REGISTRATION_COOLDOWN_MS) {
  let currentUserId: string | null = null;
  let currentRunId = 0;
  let inFlight = false;
  let pending = false;
  let lastCompletedAt: number | null = null;

  return {
    replaceUser(nextUserId: string | null) {
      if (currentUserId === nextUserId) {
        return;
      }

      currentUserId = nextUserId;
      inFlight = false;
      pending = false;
      lastCompletedAt = null;
    },
    requestRun(reason: RevalidationReason, now = Date.now()): PushRegistrationRevalidationRun | null {
      if (!currentUserId) {
        return null;
      }

      if (inFlight) {
        pending = true;
        return null;
      }

      if (reason === "foreground" && lastCompletedAt !== null && now - lastCompletedAt < cooldownMs) {
        return null;
      }

      currentRunId += 1;
      inFlight = true;

      return {
        runId: currentRunId,
        userId: currentUserId,
      };
    },
    isCurrent(run: PushRegistrationRevalidationRun) {
      return inFlight && currentUserId === run.userId && currentRunId === run.runId;
    },
    finishRun(run: PushRegistrationRevalidationRun, now = Date.now()): PushRegistrationRevalidationRun | null {
      if (currentUserId !== run.userId || currentRunId !== run.runId) {
        return null;
      }

      inFlight = false;
      lastCompletedAt = now;

      if (!pending || !currentUserId) {
        return null;
      }

      pending = false;
      currentRunId += 1;
      inFlight = true;

      return {
        runId: currentRunId,
        userId: currentUserId,
      };
    },
  };
}
