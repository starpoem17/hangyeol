export type LogStage = "auth" | "profile_bootstrap" | "onboarding_rpc" | "onboarding";
export type AnalyticsScope = "default" | "example_excluded";

export type LogPayload = {
  event: string;
  stage?: LogStage;
  analyticsScope?: AnalyticsScope;
  attempt?: number;
  hasSession: boolean;
  userIdPresent: boolean;
  errorCode?: string;
  errorMessage?: string;
  errorTag?: string;
};

function formatLog(payload: LogPayload) {
  return {
    ...payload,
    timestamp: new Date().toISOString(),
  };
}

export function logInfo(payload: LogPayload) {
  console.info(formatLog(payload));
}

export function logWarn(payload: LogPayload) {
  console.warn(formatLog(payload));
}

export function logError(payload: LogPayload) {
  console.error(formatLog(payload));
}
