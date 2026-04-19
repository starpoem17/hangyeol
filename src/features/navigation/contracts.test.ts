import { describe, expect, it } from "vitest";

import {
  FIRST_REAL_APP_ROUTE,
  HIDDEN_BOOTSTRAP_ROUTE_NAMES,
  VISIBLE_TAB_ROOT_PATHS,
  buildSegmentPath,
  isTabBarVisiblePath,
} from "./contracts";

describe("navigation contracts", () => {
  it("keeps the exact visible bottom-tab contract", () => {
    expect(VISIBLE_TAB_ROOT_PATHS).toEqual(["/inbox", "/post-concern", "/notifications", "/profile"]);
    expect(HIDDEN_BOOTSTRAP_ROUTE_NAMES).toEqual(["index", "onboarding"]);
    expect(FIRST_REAL_APP_ROUTE).toBe("/inbox");
  });

  it("shows the tab bar only on the four canonical root tab paths", () => {
    expect(isTabBarVisiblePath("/inbox")).toBe(true);
    expect(isTabBarVisiblePath("/post-concern")).toBe(true);
    expect(isTabBarVisiblePath("/notifications")).toBe(true);
    expect(isTabBarVisiblePath("/profile")).toBe(true);
    expect(isTabBarVisiblePath("/")).toBe(false);
    expect(isTabBarVisiblePath("/onboarding")).toBe(false);
    expect(isTabBarVisiblePath("/post-concern/my-concerns")).toBe(false);
  });

  it("normalizes current router segments into a pathname", () => {
    expect(buildSegmentPath([])).toBe("/");
    expect(buildSegmentPath(["inbox"])).toBe("/inbox");
    expect(buildSegmentPath(["post-concern", "my-concerns"])).toBe("/post-concern/my-concerns");
  });
});
