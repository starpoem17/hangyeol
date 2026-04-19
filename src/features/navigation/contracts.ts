export const VISIBLE_TAB_ROOT_PATHS = ["/inbox", "/post-concern", "/notifications", "/profile"] as const;

export const HIDDEN_BOOTSTRAP_ROUTE_NAMES = ["index", "onboarding"] as const;

export const FIRST_REAL_APP_ROUTE = "/inbox" as const;

export function buildSegmentPath(segments: string[]) {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

export function isTabBarVisiblePath(pathname: string) {
  return VISIBLE_TAB_ROOT_PATHS.includes(pathname as (typeof VISIBLE_TAB_ROOT_PATHS)[number]);
}
