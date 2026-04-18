# Phase 7: Final Screen Structure Lock

## 1. Final Concrete Screen-State Structure Expectation

For app/post-concern/my-concerns/responses/[responseId].tsx, the implementation must not keep the fetched response-detail object as the
sole mutable source of truth for both:

- non-editable rendered detail
- editable feedback-form behavior

Concrete implementation rule:

- the screen must use explicitly separated state domains so a generic successful detail replacement cannot accidentally overwrite
feedback-form baseline or draft state

Minimum required state separation:

1. One refreshable display-detail state, or equivalent rendering-only layer, for non-form fields such as:

- response body
- created timestamp
- concern id / navigation metadata
- any other already-rendered non-feedback detail fields

2. One feedback baseline state containing at least:

- feedbackExists
- liked
- commentBody

3. One feedback draft state containing at least:

- liked
- commentBody

The baseline state is the only source of truth for:

- create-vs-edit mode
- unchanged-vs-dirty comparison
- retained-empty edit-mode preservation

The draft state is the only source of truth for:

- current visible feedback input values
- local typing / toggling before save

## 2. Minimum Acceptable Equivalent Implementation Pattern

The preferred implementation is:

- separate refreshable display-detail state
- separate feedback baseline state
- separate feedback draft state

An alternative structure is acceptable only if it preserves exactly the same overwrite boundaries:

- successful background/detail refetch:
    - may update display-detail state
    - must not replace feedback baseline
    - must not replace feedback draft
- blocked response:
    - must not replace feedback baseline
    - must not replace feedback draft
- failed save:
    - must not replace feedback baseline
    - must not replace feedback draft
- approved-save reload:
    - may replace display-detail state
    - must replace feedback baseline from fresh server truth
    - must replace feedback draft from that same fresh server truth
- retained all-cleared row:
    - if baseline says feedbackExists = true with empty values, the screen must remain in edit mode
    - no generic reset path may collapse that into first-create mode

Disallowed implementation shape:

- one mutable detail object in state that is wholesale replaced on successful fetch/refetch and also directly drives editable feedback
mode/values

Reason:

- that shape is too easy to corrupt via generic refetch handlers and is exactly the drift risk this plan is preventing

## 3. Exact UI-Test Wording Added For Whole-Detail Replacement Regression Protection

Add or tighten test wording so the UI/presentation tests explicitly state they are guarding against accidental whole-detail replacement
bugs.

Required wording/assertion focus:

1. Generic refetch overwrite regression test

- verify a generic successful background/detail refetch cannot overwrite feedback baseline or feedback draft
- verify only display-only fields may change in that path

2. Whole-detail replacement regression test

- verify the screen logic does not behave as if one wholesale detail replacement is the source of truth for both rendering and editable
feedback state
- assert that display refresh and feedback-form state replacement have separate allowed triggers

3. Retained-empty reset regression test

- verify a generic state reset/refetch path cannot collapse:
    - feedbackExists = true
    - liked = false
    - commentBody = null
    into first-create mode

4. Approved-save reload replacement test

- verify approved-save reload is the only non-initial path allowed to replace both:
    - feedback baseline
    - feedback draft
    from fresh server detail

5. Blocked/failed preservation regression test

- verify blocked response or failed save cannot trigger a generic detail-state replacement that changes feedback baseline/draft

## Confirmation

- No route behavior changed.
- No API/error contract changed.
- No retained-row policy changed.
- No DB/RPC/notification logic changed.
- No other Phase 7 scope changed.
- This final clarification only locks the screen’s concrete state-structure expectation to prevent implementation drift.
