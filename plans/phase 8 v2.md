## 1. What is still ambiguous in the current verification section

- The prior wording still allowed mocked edge-function/unit tests to sound like proof of SQL behavior. They are not.
- In this repo at the target commit, there is no existing DB-backed automated harness. With only Vitest and mocked RPC rows, the
implementation can prove edge-function compatibility behavior, but not that the SQL function itself enforces the five feedback-
notification semantics.
- The plan therefore needs a hard proof-layer split:
    - only real DB execution can prove the SQL semantics;
    - mocked tests can only prove compatibility handling of already-shaped RPC results;
    - if DB execution is not done in this turn, the SQL-layer semantics remain unproven and must be reported that way.

## 2. Final proof-layer matrix

### Must be proven only by real SQL/DB execution

These cases require actual execution of public.save_response_feedback_with_notifications(...) against a migrated database and inspection
of persisted notifications rows:

- first non-empty comment -> exactly one response_commented
- unchanged same comment -> no new notification
- edited non-empty comment -> no new notification
- cleared comment -> no new notification
- liked + first non-empty comment in one save -> exactly two notifications

What DB execution must verify for each case:

- function/RPC return rows actually produced by the SQL function
- persisted notifications rows actually written in the database
- no duplicate notifications across repeated equivalent saves where applicable

### Can be proven by unit tests with mocked RPC rows

These tests do not prove SQL semantics. They only prove compatibility handling above the SQL layer.

- save-response-feedback/index.ts preserves multiple notification rows from the RPC response instead of collapsing them
- _shared/expo-push.ts dispatches one push job per notification row/job
- the app-facing client contract remains unchanged if no client-facing shape change is needed

### May remain unproven in this turn

If no real DB execution is performed in this turn, the following remain unproven and must be reported as DB-layer proof gaps:

- whether the corrective migration’s SQL actually enforces the five semantic cases
- whether the real function return rows match the intended no-op / saved-without-notification / two-notification shapes
- whether duplicate-prevention truly holds under actual SQL execution and repeated saves

## 3. Final required verification tasks for this repo

### Required automated proof in this repo right now

- Add/update mocked Vitest coverage for supabase/functions/save-response-feedback/index.ts.
    - Purpose: prove that a two-notification RPC result is preserved through the edge-function path and becomes two push jobs, not one.
- Add/update any minimal compatibility tests only if inspection shows another TS layer could collapse multi-row results.
- Do not label these tests as proof of SQL semantics.

### Required manual verification if feasible

- If the implementer can run a local/resettable Supabase DB during this turn, manually execute the corrective migration and verify the SQL
function directly for all five semantic cases.
- Manual verification, if completed, must inspect both:
    - returned rows from the function/RPC call
    - persisted notifications rows in the database

### If DB execution is not feasible in this turn

- The implementation may still proceed with:
    - corrective migration change
    - mocked edge-function compatibility tests
    - code inspection of the SQL logic against the locked Phase 8 rules
- But the five semantic cases must be reported as not directly DB-verified in this turn.

## 4. Final reporting rules

- The final implementation report must distinguish three categories explicitly:

### A. SQL semantics directly executed and verified

- Only include cases here if the function was actually executed against a real migrated DB and the persisted notifications rows were
checked.

### B. Edge-function compatibility proven with mocks

- Include mocked Vitest results here.
- State clearly that these tests prove handling of mocked RPC rows only, not the SQL logic itself.

### C. Remaining DB-layer proof gaps

- List every semantic case that was not directly DB-executed in this turn.
- If no DB execution happened, explicitly say that all five feedback-notification semantics remain unproven at the DB layer in this turn.
- The final report must not say only “tests passed.”
- It must enumerate:
    - which cases were DB-executed and verified
    - which compatibility behaviors were proven only with mocks
    - which DB-layer semantic guarantees remain unproven
- The final report must not imply that mocked edge-function tests prove the SQL function behavior.

## 5. Confirmed parts of the plan that remain unchanged

- Default migration strategy remains: add a new forward-only corrective migration unless the implementer can prove the old migration is
unapplied in all non-disposable environments.
- Minimal-diff rule remains: fix only the dual-notification SQL bug and any strictly necessary compatibility handling.
- Confirmed root cause remains: the early return in save_response_feedback_with_notifications(...).
- Confirmed Phase 8 semantics remain:
    - response_liked only on false/null -> true
    - response_commented only on first normalized non-empty comment creation
    - edited comments do not notify
    - cleared comments do not notify
    - liked + first comment creates exactly two notifications
- Behavior-preservation boundaries remain unchanged:
    - no broader notification rewrite
    - no unrelated refactors or cleanup
    - preserve existing result codes, target mapping, idempotence, and duplicate prevention
- Conditional app.json decision remains unchanged:
    - inspect first
    - remove only if no dependency remains
    - otherwise do not leave divergent dual authority
