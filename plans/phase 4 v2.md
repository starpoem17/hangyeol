# Phase 4 routing eligibility correction

  ## Summary

  Fix the real runtime eligibility gap in the existing Phase 4 path by correcting the server-side state loader that feeds routing.

  The correction is limited to the actual submit-concern -> routeApprovedConcernSubmission -> loadConcernRoutingState ->
  routeConcernWithDependencies path. The goal is to make runtime candidate exclusion match the already-declared rules for:

  - users already assigned to the same concern
  - users who already responded to the same concern

  No Phase 4 redesign is included:

  - no notification work
  - no retry endpoint
  - no client contract changes
  - no new product behavior
  - no speculative schema changes

  ## Root cause

  The pure filter in src/features/routing/server/eligibility.ts already excludes alreadyAssigned and alreadyResponded, but the real runtime
  loader in supabase/functions/submit-concern/index.ts does not populate those fields from database state.

  Current runtime issue:

  - loadConcernRoutingState(...) fetches same-concern deliveries only to compute existingDeliveryCount
  - when it later builds candidatePool, it hardcodes:
      - alreadyAssigned: false
      - alreadyResponded: false

  So the runtime state object is semantically incomplete even though the declared eligibility contract says those fields must come from DB
  state.

  ## Files to change

  - supabase/functions/submit-concern/index.ts
      - stop hardcoding alreadyAssigned / alreadyResponded
      - keep this file on the real submit-concern execution path
  - src/features/routing/server/runtime-state.ts (new)
      - extract the real routing state loader and its DB-read helpers out of the Edge Function file so the runtime path becomes directly
        testable without Deno request plumbing
  - src/features/routing/server/runtime-state.test.ts (new)
      - add tests for the actual DB-backed state assembly
  - src/features/routing/server/route-concern-service.test.ts
      - add a service-path test that uses real runtime state assembly output rather than a hand-built candidate pool with hardcoded flags
  - src/features/concerns/server/submit-concern-service.test.ts
      - keep the existing submit-concern-side routing trigger coverage aligned with the extracted runtime path
  - TODO.md
      - adjust only if the correction and new runtime-path tests do not land together

  ## Query/data loading changes

  Keep the query design minimal and use only existing tables.

  ### 1. Existing recipients already assigned to the same concern

  Use:

  - public.concern_deliveries
  - query: where concern_id = :concernId
  - selected fields:
      - id
      - recipient_profile_id

  Derive:

  - sameConcernDeliveryRows
  - sameConcernDeliveryIds = rows.map(id)
  - assignedRecipientIds = Set(rows.map(recipient_profile_id))
  - deliveryIdToRecipientId = Map(id -> recipient_profile_id)

  ### 2. Users who already responded to the same concern

  Determine this from the existing schema as:

  - responses.delivery_id -> concern_deliveries.id
  - and those deliveries are already scoped to the same concern by the query above

  Implementation rule:

  - query public.responses
  - filter by delivery_id in sameConcernDeliveryIds
  - selected field:
      - delivery_id

  Then derive:

  - respondedRecipientIds = Set(deliveryIdToRecipientId.get(response.delivery_id))

  This is the minimal coherent design because:

  - it uses the already-loaded same-concern deliveries
  - it does not require a new view, migration, or helper function
  - it scopes “already responded” to the same concern only, not to all historical responses

  ### 3. Do not reuse candidate-history queries for this flag

  selectCandidateResponseBodies(...) remains for OpenAI history assembly only.
  It must not be reused to infer alreadyResponded, because it is not scoped to the current concern.

  ## Runtime logic changes

  ### 1. Extract the real state loader

  Move the current loadConcernRoutingState(...) and its read helpers from supabase/functions/submit-concern/index.ts into src/features/
  routing/server/runtime-state.ts, then import it back into the Edge Function.

  Reason:

  - this is the actual runtime path
  - extraction is the smallest way to test real DB-backed assembly without changing behavior elsewhere

  ### 2. Make the loader populate candidate flags from DB state whenever candidatePool is built

  When loadConcernRoutingState(...) proceeds to candidate-pool assembly, set:

  - alreadyAssigned: assignedRecipientIds.has(profile.id)
  - alreadyResponded: respondedRecipientIds.has(profile.id)

  Do not leave these as constants.

  ### 3. Preserve the existing early short-circuit for already-routed concerns

  Keep the current minimal control flow for concerns that are already conclusively short-circuited:

  - if existingDeliveryCount > 0, return the existing already_routed-compatible state early
  - do not force full candidate-profile, interest, or history assembly for those concerns

  Reason:

  - this correction is about making eligibility correct when routing candidatePool is actually built
  - it does not require extra candidate-state work for concerns that the service will not route again

  ### 4. Keep service behavior unchanged

  routeConcernWithDependencies(...) should still:

  - short-circuit to already_routed when existingDeliveryCount > 0
  - use the same filter logic
  - keep the same no-top-off / no-mixed-selection behavior

  The correction is not to redesign rerouting. It is to ensure the runtime state loader is faithful to the declared eligibility contract
  whenever it builds routing state for an actually routable concern.

  ## Test changes

  The correction must cover three distinct responsibilities with minimal mocking.

  ### 1. Runtime-state tests

  Add src/features/routing/server/runtime-state.test.ts.

  Responsibility:

  - prove that alreadyAssigned and alreadyResponded are derived correctly from DB query results

  Test with a mocked Supabase service client that returns real DB-like rows for:

  - concerns
  - concern_deliveries
  - responses
  - profiles
  - profile_interests
  - candidate concern history
  - candidate response history

  Required assertions:

  - a candidate whose recipient_profile_id appears in same-concern concern_deliveries gets alreadyAssigned: true
  - a candidate whose same-concern delivery appears in responses.delivery_id gets alreadyResponded: true
  - unrelated response history does not mark alreadyResponded for the current concern
  - these flags are derived from mocked query results, not injected into the candidate pool

  This layer proves state assembly only, not OpenAI exclusion.

  ### 2. Service-path tests

  Revise src/features/routing/server/route-concern-service.test.ts or add a new adjacent test file.

  Responsibility:

  - prove that the real routing flow excludes candidates flagged by runtime state before OpenAI selection

  Use:

  - the real extracted runtime loader output
  - mocked DB query results feeding that loader
  - mocked OpenAI selection dependency
  - mocked delivery creation dependency

  Required assertions:

  - when one candidate is already assigned to the same concern, the OpenAI selector input excludes that candidate in the actual runtime flow
  - when one candidate already responded to the same concern, the OpenAI selector input excludes that candidate in the actual runtime flow

  What may be mocked:

  - Supabase read results
  - OpenAI selection dependency
  - delivery creation dependency

  What must no longer be hardcoded as false in these tests:

  - alreadyAssigned
  - alreadyResponded

  This layer proves routing behavior over assembled state, not raw DB derivation.

  ### 3. Submit-concern-side tests

  Keep and, if needed, lightly revise src/features/concerns/server/submit-concern-service.test.ts.

  Responsibility:

  - continue proving that approved concern persistence triggers routing on the real backend path boundary

  Keep the current narrow contract:

  - blocked submissions do not trigger routing
  - approved submissions do trigger routing
  - routing failure does not change the approved submit-concern response contract

  This layer proves backend-path invocation only, not candidate-flag derivation or OpenAI exclusion details.

  ### 4. Keep pure eligibility tests

  Do not remove the pure eligibility.ts tests.
  They still validate the filter itself.
  The correction is to add runtime-path coverage so the bug cannot hide behind correct pure helpers.

  ## TODO.md impact

  Conservative rule:

  - do not add any new checkmarks for this correction
  - the previously checked routing items can remain checked only if this fix and the new runtime-path tests land in the same correction
    change

  Specifically:

  - 서버 라우팅 eligibility filter를 구현한다.
  - 라우팅 테스트를 작성한다.

  These two checks were optimistic in the current state because the runtime loader did not fully honor the declared exclusion rules.
  After this correction is implemented and the new runtime-path tests pass, they can remain checked.
  If the fix or the runtime-path tests are not included together, those two checkmarks should be reverted instead of left as-is.

  ## Risks / things to avoid

  - Do not broaden the fix into notification, retry, or client API work.
  - Do not add schema changes; existing tables are sufficient.
  - Do not infer alreadyResponded from all historical responses. Scope it only through same-concern deliveries.
  - Do not leave alreadyAssigned / alreadyResponded as hardcoded booleans anywhere on the real submit-concern routing path.
  - Do not force full candidate-state assembly for concerns already conclusively short-circuited as already_routed.
  - Do not make the test layers redundant:
      - runtime-state tests prove DB derivation
      - service-path tests prove exclusion before OpenAI
      - submit-concern-side tests prove routing is triggered from approved concern persistence
  - Do not stop at pure helper tests; the correction is specifically about the real runtime state loader path.
  - Do not change the existing already_routed service outcome or delivery-count semantics.
  - Do not mix this correction with unrelated session/test failures elsewhere in the repo.
