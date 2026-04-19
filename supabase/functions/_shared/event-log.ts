export type AnalyticsScope = "default" | "example_excluded";

export type EventLogPayload = {
  event: string;
  analyticsScope?: AnalyticsScope;
  [key: string]: unknown;
};

function withTimestamp(payload: EventLogPayload) {
  return {
    ...payload,
    timestamp: new Date().toISOString(),
  };
}

export function logEvent(payload: EventLogPayload) {
  console.info(withTimestamp(payload));
}

export function logEventError(payload: EventLogPayload) {
  console.error(withTimestamp(payload));
}
