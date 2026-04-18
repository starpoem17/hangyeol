export type PhaseProfile = {
  id: string;
  gender: "male" | "female" | null;
  onboardingCompleted: boolean;
};

export type BootstrapStatus = "idle" | "loading" | "failed";
export type GateRoute = "loading" | "onboarding" | "inbox" | "fatal-error";

export type GateInput = {
  hasSession: boolean;
  bootstrapStatus: BootstrapStatus;
  profile: PhaseProfile | null;
};

export function decideGateRoute(input: GateInput): GateRoute {
  if (input.bootstrapStatus === "failed") {
    return "fatal-error";
  }

  if (!input.hasSession || input.bootstrapStatus === "loading") {
    return "loading";
  }

  if (!input.profile) {
    return "loading";
  }

  if (input.profile.onboardingCompleted && input.profile.gender !== null) {
    return "inbox";
  }

  return "onboarding";
}
