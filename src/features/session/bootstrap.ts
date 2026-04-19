import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { logInfo, logWarn, type LogPayload } from "@/lib/logger";

import type { PhaseProfile } from "./gate";

export const PROFILE_FETCH_RETRY_DELAYS_MS = [0, 200, 400, 800, 1600] as const;

export type ProfileFetchResult =
  | {
      kind: "success";
      profile: PhaseProfile;
    }
  | {
      kind: "failed";
      errorCode?: string;
      errorMessage?: string;
    }
  | {
      kind: "stale";
    };

export type BootstrapRun = {
  key: string;
  runId: number;
};

export function getBootstrapKey(session: Session | null) {
  return session?.user.id ?? "no-session";
}

export function createBootstrapRunController() {
  let currentKey: string | null = null;
  let currentRunId = 0;
  let inFlight = false;

  return {
    canStart(key: string) {
      return !(inFlight && currentKey === key);
    },
    start(key: string): BootstrapRun {
      currentKey = key;
      currentRunId += 1;
      inFlight = true;

      return {
        key,
        runId: currentRunId,
      };
    },
    isCurrent(run: BootstrapRun) {
      return inFlight && currentKey === run.key && currentRunId === run.runId;
    },
    finish(run: BootstrapRun) {
      if (currentKey === run.key && currentRunId === run.runId) {
        inFlight = false;
      }
    },
    reset() {
      inFlight = false;
    },
  };
}

export async function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapProfileRow(row: {
  id: string;
  gender: "male" | "female" | null;
  onboarding_completed: boolean;
}): PhaseProfile {
  return {
    id: row.id,
    gender: row.gender,
    onboardingCompleted: row.onboarding_completed,
  };
}

function buildProfileLogPayload(
  session: Session,
  event: string,
  attempt: number,
  overrides?: Partial<LogPayload>,
): LogPayload {
  return {
    event,
    stage: "profile_bootstrap",
    attempt,
    hasSession: true,
    userIdPresent: Boolean(session.user.id),
    ...overrides,
  };
}

export async function fetchOwnProfileWithRetry(params: {
  supabase: SupabaseClient;
  session: Session;
  isCurrent: () => boolean;
  delaysMs?: readonly number[];
}) : Promise<ProfileFetchResult> {
  const { supabase, session, isCurrent, delaysMs = PROFILE_FETCH_RETRY_DELAYS_MS } = params;
  let lastFailure: { errorCode?: string; errorMessage?: string } = {};

  console.log("CURRENT_SESSION_USER_ID", session.user.id);

  for (let index = 0; index < delaysMs.length; index += 1) {
    const delayMs = delaysMs[index];
    const attempt = index + 1;

    if (delayMs > 0) {
      await delay(delayMs);
    }

    if (!isCurrent()) {
      return { kind: "stale" };
    }

    logInfo(buildProfileLogPayload(session, "profile_fetch_attempted", attempt));

    const { data, error } = await supabase
      .from("profiles")
      .select("id, gender, onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!isCurrent()) {
      return { kind: "stale" };
    }

    if (error) {
      lastFailure = {
        errorCode: error.code,
        errorMessage: error.message,
      };

      logWarn(
        buildProfileLogPayload(session, "profile_fetch_failed", attempt, {
          errorCode: error.code,
          errorMessage: error.message,
        }),
      );
      continue;
    }

    if (!data) {
      lastFailure = {
        errorMessage: "profile row was not found",
      };

      logWarn(
        buildProfileLogPayload(session, "profile_fetch_failed", attempt, {
          errorMessage: "profile row was not found",
        }),
      );
      continue;
    }

    logInfo(buildProfileLogPayload(session, "profile_fetch_succeeded", attempt));

    return {
      kind: "success",
      profile: mapProfileRow(data),
    };
  }

  return {
    kind: "failed",
    ...lastFailure,
  };
}
