# Feedback Flow Correction Pass

## Summary

This pass stays narrow and fixes only the identified issues:

- correct the earlier scope description
- wire the failed-save screen path to the existing preservation helper explicitly
- remove feedbackExists as the persistence write authority
- add only the narrow tests needed to prove the stale-baseline persistence fix
- preserve the Phase 7 state-separation contract

The earlier report did understate scope: this phase was not purely screen-level, because it already introduced a DB/runtime behavior
change via supabase/migrations/20260419000000_phase7_response_feedback_editing.sql, enabling concern-author updates on response_feedback
under author-scoped RLS.

## Allowed Scope

Files to edit:

- app/post-concern/my-concerns/responses/[responseId].tsx
- src/features/my-concern-responses/api.ts
- src/features/my-concern-responses/api.test.ts
- src/features/my-concern-responses/feedback-state.test.ts only if existing assertions do not already directly prove the helper-layer
invariants

Constraints that remain in force:

- no new files
- no production exports or test-only helpers
- no migration changes
- no TODO.md edits
- no screen-structure redesign
- no integration/UI harness expansion
- no unrelated edits inside [responseId].tsx beyond the failed-save wiring and minimal imports/types needed for it

If the fix cannot be completed within this file scope, stop and report the exact blocking contradiction plus the minimum additional scope
required.

## Code Changes

### src/features/my-concern-responses/api.ts

Change the save path from insert/update branching to one conflict-safe write path.

Required behavior:

- remove feedbackExists from the save input type
- use upsert on response_feedback
- use conflict target exactly response_id,concern_author_profile_id
- keep the saved payload limited to:
    - response_id
    - concern_author_profile_id
    - liked
    - comment_body

Callsite verification in this file must explicitly cover all of the following before finalizing the change:

- payload typing at the real SupabaseClient callsite
- return-value expectations of the current save function
- error-handling behavior of the current save function
- whether replacing insert/update with one upsert path preserves the current function contract without hidden additional edits

The intended contract to preserve is:

- success still resolves without throwing
- failure still throws through the same surrounding error path
- the function does not start depending on new returned row data
- no unrelated save semantics change beyond the accepted stale-baseline hardening

Fallbacks that are still allowed within scope:

- use array payload instead of object payload if needed at the callsite
- use a minimal local cast if the obstacle is only typing inference

Decision rule for non-typing mismatch:

- if the intended upsert path cannot preserve the current save function contract within the allowed file scope because of return-shape or
error-handling mismatch, stop
- report:
    - the exact mismatch
    - why it is not merely typing friction
    - the minimum additional code change required

Do not quietly improvise a broader rewrite.

Accepted runtime delta remains narrow:

- stale create-path no longer risks uniqueness-conflict failure
- stale edit-path may now create the row where a prior update would have affected zero rows

Do not let the upsert rewrite silently change unrelated save semantics.

### app/post-concern/my-concerns/responses/[responseId].tsx

Change only the failed-save branch wiring.

Required behavior:

- import applyBlockedOrFailedSavePreservation
- in the async save catch branch, read the latest committed split state from screenStateRef.current
- if present, apply the preservation helper explicitly there

The screen-side runtime contract that must remain true after this change is:

- the catch path must preserve the current dirty draft
- the catch path must not replace baseline/draft from any unrelated source
- the catch path must preserve the existing error-reporting behavior
- the catch/finally flow must still leave isSavingFeedback in the same post-failure state as before

This remains a narrow catch-path wiring change. Do not restructure the screen.

Explicit decision rule for screen-side contradiction:

- if preserving the failed-save runtime contract requires broader edits to [responseId].tsx than the currently allowed narrow wiring
change, stop and report that contradiction rather than widening scope silently

### Success-path non-regression boundary

The success path is not a redesign target in this pass.

It must remain:

- save
- fresh fetch
- approved-save reload replacement only

This is a non-regression boundary for the correction pass.

## Verification

### Automated proof

src/features/my-concern-responses/api.test.ts
Add narrow tests proving:

- save uses one conflict-safe persistence path
- save uses conflict target response_id,concern_author_profile_id
- save writes exactly the intended persisted fields
- stale-baseline save succeeds by resolving without throwing through that same upsert path

src/features/my-concern-responses/feedback-state.test.ts
Leave unchanged unless the existing assertions do not already directly prove the helper-layer invariants that matter here:

- generic refetch cannot replace baseline/draft
- approved-save reload is the only helper path that replaces baseline/draft from fresh server truth
- retained-empty edit mode remains stable

If needed, make the smallest targeted update only.

### Runtime verification at the real screen callsite

Verify directly in [responseId].tsx that:

- the failed-save branch now explicitly uses the preservation helper
- the failed-save branch still preserves dirty draft, error behavior, and isSavingFeedback post-failure behavior
- the failed-save branch does not replace baseline/draft from any unrelated source
- the success path still follows save -> fresh fetch -> approved-save reload replacement only

There is no automated screen-level test in this pass. That is an intentional scope decision, not an implicit omission.

## Acceptance Criteria

The correction is complete when:

- api.ts no longer branches on feedbackExists
- api.ts persists through one conflict-safe upsert path
- the real api.ts callsite verification confirms payload typing, return behavior, and error behavior all remain compatible within scope
- [responseId].tsx explicitly uses the preservation helper in the failed-save branch
- [responseId].tsx preserves its current failed-save runtime contract while switching to explicit preservation-helper wiring
- the success path remains a non-regression boundary with save -> fresh fetch -> approved-save reload replacement only
- existing Phase 7 state-separation guarantees still hold
- tests pass with the new narrow persistence coverage
- no scope creep was introduced

## Final Report

Keep the final handoff precise and short. It should include:

- exact files changed
- exact behavioral delta from the previous commit
- exact tests added or revised
- whether the Phase 7 state-separation contract still holds
- explicit acknowledgement that the earlier report understated the DB/runtime scope

It should also include one short dedicated subsection for the real screen callsite verification result, stating whether [responseId].tsx
verification confirmed all of the following:

- failed-save catch branch explicitly routes through applyBlockedOrFailedSavePreservation
- dirty draft remains preserved after failure
- no unrelated source replaces baseline/draft in the failed-save path
- error-reporting behavior remains unchanged
- isSavingFeedback post-failure behavior remains unchanged
- success path still follows save -> fresh fetch -> approved-save reload replacement only
