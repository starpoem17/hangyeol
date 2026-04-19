import { describe, expect, it } from "vitest";

import {
  CANONICAL_INTEREST_KEY_SET as APP_CANONICAL_INTEREST_KEY_SET,
  CANONICAL_INTERESTS,
} from "../../src/features/onboarding/constants";
import {
  CANONICAL_INTEREST_KEYS,
  CANONICAL_INTEREST_KEY_SET,
} from "./canonical-interest-keys";

describe("shared canonical interest keys", () => {
  it("stay aligned with onboarding constants", () => {
    expect(CANONICAL_INTEREST_KEYS).toEqual(CANONICAL_INTERESTS.map((interest) => interest.key));
    expect([...CANONICAL_INTEREST_KEY_SET].sort()).toEqual([...APP_CANONICAL_INTEREST_KEY_SET].sort());
  });
});
