import { describe, expect, it } from "vitest";

import { decideGateRoute } from "./gate";

describe("decideGateRoute", () => {
  it("stays in loading while no session is being established", () => {
    expect(
      decideGateRoute({
        hasSession: false,
        bootstrapStatus: "loading",
        profile: null,
      }),
    ).toBe("loading");
  });

  it("stays in loading while profile is still being fetched", () => {
    expect(
      decideGateRoute({
        hasSession: true,
        bootstrapStatus: "loading",
        profile: null,
      }),
    ).toBe("loading");
  });

  it("routes onboarded users to inbox", () => {
    expect(
      decideGateRoute({
        hasSession: true,
        bootstrapStatus: "idle",
        profile: {
          id: "profile-1",
          gender: "female",
          onboardingCompleted: true,
        },
      }),
    ).toBe("inbox");
  });

  it("routes incomplete users to onboarding", () => {
    expect(
      decideGateRoute({
        hasSession: true,
        bootstrapStatus: "idle",
        profile: {
          id: "profile-1",
          gender: null,
          onboardingCompleted: false,
        },
      }),
    ).toBe("onboarding");
  });

  it("routes bootstrap failures to fatal-error", () => {
    expect(
      decideGateRoute({
        hasSession: true,
        bootstrapStatus: "failed",
        profile: null,
      }),
    ).toBe("fatal-error");
  });
});
