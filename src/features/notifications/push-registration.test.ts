import { describe, expect, it } from "vitest";

import {
  createPushRegistrationRevalidationController,
  mapPushRegistrationProfile,
  PUSH_REGISTRATION_COOLDOWN_MS,
} from "./push-registration-core";
import { isProfileReadyForInbox } from "../session/gate";

describe("mapPushRegistrationProfile", () => {
  it("maps the minimal root-layout profile read into the shared gate profile shape", () => {
    const profile = mapPushRegistrationProfile({
      id: "profile-1",
      gender: "female",
      onboarding_completed: true,
    });

    expect(profile).toEqual({
      id: "profile-1",
      gender: "female",
      onboardingCompleted: true,
    });
    expect(isProfileReadyForInbox(profile)).toBe(true);
  });
});

describe("createPushRegistrationRevalidationController", () => {
  it("coalesces in-flight foreground triggers into exactly one follow-up run", () => {
    const controller = createPushRegistrationRevalidationController();

    controller.replaceUser("user-1");

    const firstRun = controller.requestRun("session", 0);
    expect(firstRun).not.toBeNull();
    expect(controller.requestRun("foreground", 1)).toBeNull();

    const secondRun = controller.finishRun(firstRun!, 2);
    expect(secondRun).not.toBeNull();
    expect(secondRun?.runId).not.toBe(firstRun?.runId);
    expect(controller.finishRun(secondRun!, 3)).toBeNull();
  });

  it("drops foreground triggers inside the cooldown window when no run is in flight", () => {
    const controller = createPushRegistrationRevalidationController();

    controller.replaceUser("user-1");

    const firstRun = controller.requestRun("session", 0);
    expect(firstRun).not.toBeNull();
    expect(controller.finishRun(firstRun!, 10)).toBeNull();

    expect(controller.requestRun("foreground", 10 + PUSH_REGISTRATION_COOLDOWN_MS - 1)).toBeNull();
    expect(controller.requestRun("foreground", 10 + PUSH_REGISTRATION_COOLDOWN_MS)).not.toBeNull();
  });

  it("resets stale run state and cooldown immediately when the session user changes", () => {
    const controller = createPushRegistrationRevalidationController();

    controller.replaceUser("user-1");
    const firstRun = controller.requestRun("session", 0);

    controller.replaceUser("user-2");

    expect(controller.isCurrent(firstRun!)).toBe(false);
    expect(controller.requestRun("session", 1)).toEqual({
      runId: 2,
      userId: "user-2",
    });
  });
});
