  # Phase 6 Closure Plan Final Execution Standard

  ## Summary

  Phase 6 closure will be validated in two runs:

  - Run R: authored-response RPC authorization only
  - Run U: reachable authored-flow UI plus real notification-driven response viewing

  This split remains the smallest reliable design in this repository because:

  - RPC authorization requires controlled authenticated callers
  - UI validation requires isolated browser sessions and actual route transitions
  - the repo does not provide a stable standard path for reusing the same anonymous session across scripted RPC clients and Expo UI

  No repo mutation is allowed before an observed Phase 6 mismatch.
  If a mismatch is found during validation, only the smallest Phase-6-scoped fix is allowed, followed by rerunning only the affected
  essential scenarios.

  ## Artifact Sets and Scenario Prerequisites

  ### Artifact set A: authored-flow minimum dataset

  Artifact set A is complete only when all of the following exist in the same fresh run dataset:

  - one approved real concern authored by A
  - exactly one delivery attached to that concern
  - that delivery’s recipient is B
  - one approved response attached to that delivery

  ### Artifact set A proof standard

  Artifact set A proof must record all of the following together:

  - concern_id
  - delivery_id
  - response_id
  - concern author user id
  - delivery recipient user id
  - linkage:
      - delivery.concern_id == concern_id
      - response.delivery_id == delivery_id
      - concern author == A
      - delivery recipient == B

  Artifact set A is the minimum prerequisite for:

  - all Run R scenarios R1-R8
  - Run U authored concern detail success
  - Run U attached response-preview rendering
  - Run U response-preview tap navigation
  - Run U response-detail rendering success
  - Run U ownership-based unauthorized/stale response-detail handling
  - Run U back-to-concern navigation

  ### Artifact set B: notification minimum dataset

  Artifact set B is complete only when all of the following exist in the same fresh run dataset:

  - Artifact set A is complete
  - at least one notification row for A
  - one specific notification row can be identified unambiguously as the run target
  - that target row has:
      - type = response_received
      - related_entity_type = response
      - related_entity_id = response_id

  ### Artifact set B proof standard

  Artifact set B proof must record all of the following together for the target notification row:

  - notification_id
  - profile_id
  - type
  - related_entity_type
  - related_entity_id
  - linkage:
      - notification.id == notification_id_u
      - notification.related_entity_id == response_id_u
      - response.delivery_id == delivery_id_u
      - delivery.concern_id == concern_id_u
      - notification.profile_id == A_u

  Additional notification rows may exist. They do not fail Artifact set B by themselves unless they prevent unambiguous identification or
  validation of the target row.

  Artifact set B is the minimum prerequisite for:

  - notification list validation
  - notification tap navigation to authored response detail
  - notification-driven response-detail rendering success
  - notification path return to correct concern

  ### Scenario-level prerequisite rules

  - Any scenario that reads or navigates to response detail explicitly requires Artifact set A
  - Any scenario that validates a notification row explicitly requires Artifact set B
  - Concern detail success requires the authored concern artifact
  - Concern detail success with attached response preview requires Artifact set A
  - Response-preview navigation validation requires:
      - authored concern detail already rendered successfully for the same concern_id_u
      - the attached response preview already visibly rendered successfully for that same concern
      - therefore it explicitly depends on Artifact set A

  ## Failure Classification

  ### Environment failure

  Only these count as environment failure:

  - local Supabase not running
  - migrations not applied
  - Edge Functions not running
  - SUPABASE_SERVICE_ROLE_KEY missing
  - OPENAI_API_KEY missing
  - OpenAI network or 5xx failure
  - Expo web not pointed at the same local Supabase project

  Environment failure makes the run invalid. No product judgment is made.

  ### Shared dependency blocker

  A shared dependency blocker is a failure in prerequisite artifact creation before the Phase 6-added surfaces can be fully evaluated.

  Examples:

  - Artifact set A cannot be completed because the expected concern -> delivery -> response chain is not produced
  - Artifact set B cannot be completed because no target response_received notification row can be identified for the current run response

  Shared dependency blockers do not automatically mean Phase 6 is defective.
  However, they do block closure for any essential scenarios that depend on the missing artifact.

  ### Phase 6 defect

  A Phase 6 defect is a failure in the Phase 6-added surface after the required artifact exists.

  Examples:

  - authored RPC authorization boundary fails
  - /inbox reachability chain is incomplete
  - authored concern detail or response detail shows wrong data
  - concern detail shows responses not attached to the authored concern being viewed
  - response detail resolves the wrong response
  - unauthorized or stale authored routes leak protected concern or response body
  - notification tap does not open the exact authored response detail
  - 해당 고민으로 돌아가기 returns to the wrong concern
  - TODO.md overstates completion relative to validated evidence

  ## Partial-Progress Handling

  ### If Artifact set A is missing

  Then:

  - Run R cannot proceed
  - Run U authored-flow essential subset cannot proceed
  - notification subset cannot proceed
  - final verdict is Phase 6 not closed
  - blocker is reported under shared dependency blockers

  ### If Artifact set A exists but Artifact set B does not

  Then all of the following are still mandatory:

  - complete Run R fully
  - complete the authored-flow essential subset of Run U
  - report the notification essential subset as blocked
  - final verdict must explicitly state:
      - Phase 6 is not closed
      - reason: notification-driven validation remains blocked because Artifact set B was not created

  In this case:

  - authored RPC evidence still counts
  - authored-flow UI evidence still counts
  - only notification-dependent evidence is blocked

  ## Deterministic Dataset Preconditions

  Each run begins with a fresh local DB reset.

  ### Users

  - Run R
      - A_r
      - B_r
      - C_r
  - Run U
      - A_u
      - B_u
      - C_u
      - D_u
      - E_u

  ### User states

  - A: onboarded
  - B: onboarded
  - C: authenticated but onboarding incomplete
  - D: onboarded, no authored concerns
  - E: onboarded, unrelated to A’s concern and unrelated to B’s response

  ### Fixed test content

  Concern body:

  - 공부 루틴을 만들고 싶어요. 하루 계획을 어떻게 세우면 좋을까요?

  Response body:

  - 작은 목표 세 개만 정하고 아침과 저녁에 짧게 점검해 보세요.

  ### Deterministic routing proof

  For each run, deterministic routing proof must be based on the users that exist at the exact time A submits the concern, not on later-
  added users.

  Proof requires all of the following:

  - the run dataset contains no extra onboarded general users outside the intended set that already exist before concern submission
  - after A submits the concern, delivery count for that concern is exactly 1
  - that sole recipient is B
  - there is no second delivery for the same concern

  This proof is part of establishing Artifact set A.
  If it fails, record a shared dependency blocker and stop any scenario that depends on Artifact set A.

  ## Run R: RPC Authorization Validation

  ### Run R caller assumption

  For Run R, C_r remains valid as the unrelated authenticated caller.

  Reason:

  - the authored-response RPC boundary is based on authenticated identity and authored-resource ownership
  - onboarding completion is not part of the RPC authorization condition
  - therefore an authenticated but onboarding-incomplete unrelated caller is still a valid negative-case caller for RPC authorization
    testing

  No additional onboarded unrelated RPC caller is required unless a defect is observed that suggests onboarding state is affecting the RPC
  result.

  ### Setup

  1. fresh reset
  2. create A_r, B_r, C_r
  3. complete onboarding for A_r and B_r
  4. leave C_r onboarding incomplete
  5. A_r submits one approved real concern
  6. prove deterministic routing
  7. B_r submits one approved response
  8. capture:

  - concern_id_r
  - delivery_id_r
  - response_id_r

  ### Stale IDs

  - stale concern id:
      - 00000000-0000-0000-0000-000000000001
  - stale response id:
      - 00000000-0000-0000-0000-000000000002

  ### Essential scenarios

  #### R1. A_r can list responses for authored concern

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - row count = 1
  - required fields are present:
      - response_id
      - body
      - created_at
  - required field values are correct:
      - response_id == response_id_r
      - body equals fixed response body
  - authorization boundary is correct
  - no additional response row is returned

  Extra fields:

  - must be reported if observed
  - do not fail closure automatically unless they create a real contract or security violation
  - contract/security-violating examples include:
      - leaked unrelated delivery linkage or protected author/recipient data not intended for this RPC surface
      - artifact resolution ambiguity caused by extra fields contradicting required fields

  #### R2. B_r cannot list as concern author

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - row count = 0

  #### R3. C_r cannot list

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - row count = 0

  #### R4. A_r can read authored response detail

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - exactly one row returned
  - required fields are present:
      - response_id
      - concern_id
      - body
      - created_at
  - required field values are correct:
      - response_id == response_id_r
      - concern_id == concern_id_r
      - body equals fixed response body
  - authorization boundary is correct

  Extra fields:

  - must be reported if observed
  - do not fail closure automatically unless they create a real contract or security violation
  - contract/security-violating examples include:
      - leaked protected linkage or unrelated ownership data not intended for this RPC surface
      - artifact resolution ambiguity caused by extra fields contradicting required fields

  #### R5. B_r cannot read authored response detail

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - no row returned

  #### R6. C_r cannot read authored response detail

  Prerequisite:

  - Artifact set A complete

  Pass if:

  - no row returned

  #### R7. stale concern id returns no rows

  Prerequisite:

  - Artifact set A complete

  Actor:

  - A_r

  Pass if:

  - row count = 0

  #### R8. stale response id returns no row

  Prerequisite:

  - Artifact set A complete

  Actor:

  - A_r

  Pass if:

  - no row returned

  ## Run U: Reachable Authored UI and Real Notification Flow

  ### Setup order for deterministic routing

  Run U setup is intentionally split into two phases so that extra onboarded users do not contaminate Artifact set A creation.

  #### Phase U-A: minimum users for artifact creation

  1. fresh reset
  2. start Expo web against the same local Supabase
  3. create isolated browser profiles for:

  - A_u
  - B_u
  - C_u

  4. complete onboarding for A_u and B_u
  5. keep C_u onboarding incomplete
  6. A_u submits one approved real concern
  7. prove deterministic routing
  8. B_u opens the assigned delivery and submits one approved response
  9. capture:

  - concern_id_u
  - delivery_id_u
  - response_id_u
  - notification_id_u once the target notification row is identified

  #### Phase U-B: additional users for later UI checks

  Only after Artifact set A has been proven may the following users be created and onboarded:

  - D_u
  - E_u

  This ensures:

  - D_u can be used for supporting empty-state observation without contaminating routing
  - E_u can be used for ownership-based unauthorized UI checks without weakening Artifact set A creation

  ### Notification identity proof

  Before any notification scenario:

  - confirm Artifact set B complete
  - DB must prove for A_u that the target notification row exists with:
      - id = notification_id_u
      - type = response_received
      - related_entity_type = response
      - related_entity_id = response_id_u
  - DB must prove linkage:
      - notification_id_u -> response_id_u -> delivery_id_u -> concern_id_u
  - additional notification rows may exist, but they must be reported separately and do not block closure unless they make the target row
    ambiguous or invalidate validation of the target row

  Optional local-cleanliness observation:

  - if the notification list also happens to contain only the target row, report that as supporting evidence only
  - this is not closure-essential evidence

  ## Safe-State Acceptance Model

  ### Concern-detail safe-state allowed patterns

  For authored concern-detail denial or stale handling, only these safe-state outcomes are accepted:

  1. Same-route safe rendering

  - attempted route remains /post-concern/my-concerns/[concernId]
  - the screen settles into a safe non-content state on that route

  2. Redirected safe route

  - attempted route settles on /post-concern/my-concerns
  - the screen settles into a safe non-detail state there

  No other route outcome is accepted.

  ### Response-detail safe-state allowed patterns

  For authored response-detail denial or stale handling, only these safe-state outcomes are accepted:

  1. Same-route safe rendering

  - attempted route remains /post-concern/my-concerns/responses/[responseId]
  - the screen settles into a safe non-content state on that route

  2. Redirected safe route

  - attempted route settles on /post-concern/my-concerns
  - the screen settles into a safe non-detail state there

  No other route outcome is accepted.

  ### Non-accepted safe outcomes

  For U6, U7, U8, U9, U10, all of the following are non-accepted outcomes:

  - protected body visible after settle
  - authored-only action visible after settle
  - ambiguous intermediate route that settles on the wrong screen
  - final route or UI state that cannot be classified into one of the allowed safe-state patterns above

  ## Run U Essential Scenarios

  ### U1. /inbox -> /post-concern -> /post-concern/my-concerns reachability chain is closed

  Prerequisite:

  - none beyond working app bootstrap for A_u

  Pass if:

  - /inbox visibly exposes Post concern
  - tapping Post concern reaches /post-concern
  - the final settled route after the first tap is /post-concern
  - from /post-concern, the single entry reaches /post-concern/my-concerns
  - the final settled route after the second tap is /post-concern/my-concerns

  ### U2. /inbox -> /notifications reachability chain is closed

  Prerequisite:

  - none beyond working app bootstrap for A_u

  Pass if:

  - /inbox visibly exposes Notifications
  - tapping Notifications from /inbox reaches /notifications
  - the final settled route is /notifications

  ### U3. my concerns list shows and opens the authored concern artifact correctly

  Prerequisite:

  - authored concern artifact exists for A_u

  Success evidence categories:

  - target artifact represented in UI:
      - one visible concern-list item is treated as the target card
  - target artifact identity tied to run artifact:
      - that card contains visible concern text matching the fixed concern body, sufficient to distinguish it from other visible cards in
        the current list state
  - target element actionable:
      - that exact card is tappable and used for navigation
  - no ambiguity with another visible candidate element:
      - no second visible card qualifies equally as the target artifact without a reliable way to distinguish between them

  Pass if:

  - the target card is visibly present in the list
  - the target card is identified as the concern_id_u artifact by its visible concern-body evidence before the tap result is used
  - tapping that exact card opens /post-concern/my-concerns/[concern_id_u]
  - the final settled route is /post-concern/my-concerns/[concern_id_u]
  - the tap result confirms the chosen card resolved to the same concern_id_u artifact

  Fail if:

  - no visible card can be identified confidently as the run-authored concern
  - more than one visible card is an equally plausible target and the plan cannot distinguish which one is concern_id_u
  - the chosen card is actionable but its identity as concern_id_u is not defensible
  - the tapped card resolves to the wrong concern artifact

  ### U4a. authored concern-detail core rendering

  Prerequisite:

  - authored concern artifact exists for A_u

  Pass if:

  - final settled route is /post-concern/my-concerns/[concern_id_u]
  - full concern body equals fixed concern text
  - the rendered concern corresponds to concern_id_u

  ### U4b. attached response-preview rendering

  Prerequisite:

  - Artifact set A complete

  Success evidence categories:

  - target artifact represented in UI:
      - one visible response preview on concern detail is treated as the target preview for response_id_u
  - target artifact identity tied to DB linkage:
      - the preview belongs to the currently rendered concern_id_u detail screen
      - the preview text matches the fixed response body for response_id_u
      - DB linkage proves response_id_u is attached to concern_id_u
  - target element actionable where required:
      - the target preview is visibly tappable for use in U5a
  - no ambiguity with another visible candidate element:
      - no second visible preview matches the same evidence such that response_id_u cannot be distinguished

  Pass if:

  - final settled route remains /post-concern/my-concerns/[concern_id_u]
  - the target preview for response_id_u is visibly present on the concern_id_u detail screen
  - the target preview is identified by visible preview text matching the fixed response body plus DB linkage showing that response_id_u is
    attached to concern_id_u
  - the preview set shown on concern detail matches exactly the response artifacts attached to concern_id_u in the run dataset
  - no attached response for concern_id_u is missing from the rendered preview set
  - no response preview for another concern is present
  - the target preview is actionable for U5a

  Fail if:

  - no visible preview can be identified confidently as response_id_u
  - more than one visible preview is an equally plausible match for response_id_u and cannot be distinguished
  - a visible preview exists but cannot be tied confidently to a response artifact attached to concern_id_u
  - any preview from another concern is present
  - the preview set is incomplete relative to DB linkage

  If Artifact set A exists and U4b fails:

  - treat it as a direct failure of authored response-list/detail scope
  - do not treat it as a soft or optional UI omission

  ### U5a. response preview tap navigation success

  Prerequisite:

  - Artifact set A complete
  - U4a passed for concern_id_u
  - U4b passed for concern_id_u

  Pass if:

  - tapping the preview identified in U4b reaches /post-concern/my-concerns/responses/[response_id_u]
  - the final settled route is /post-concern/my-concerns/responses/[response_id_u]

  ### U5b. response-detail rendering success

  Prerequisite:

  - Artifact set A complete
  - U5a passed for response_id_u

  Pass if:

  - on the settled route /post-concern/my-concerns/responses/[response_id_u], response detail shows the fixed response body
  - the resolved detail corresponds to response_id_u, not merely any readable response body

  ### U6. authored concern detail unauthorized handling for unrelated onboarded user

  Prerequisite:

  - authored concern artifact exists for A_u
  - E_u exists and is authenticated and fully onboarded
  - E_u is created only after Artifact set A proof is complete

  Actor:

  - E_u

  Action:

  - directly open /post-concern/my-concerns/[concern_id_u]

  Concern-detail evidence categories:

  - protected primary content absent:
      - concern body absent
  - protected related/secondary content absent:
      - response preview absent
  - authored-only actions absent:
      - any concern-detail-only action absent
  - safe-state route pattern matched:
      - same-route safe rendering or redirected safe route
  - recovery UI present

  Pass if:

  - bootstrap and onboarding are already satisfied for E_u
  - denial happens after normal authenticated app access was established
  - the final settled route matches one of the allowed concern-detail safe-state patterns
  - protected primary content is absent
  - protected related/secondary content is absent
  - authored-only actions are absent
  - recovery UI is present

  ### U7. authored concern detail stale handling

  Prerequisite:

  - authored concern artifact exists for A_u

  Actor:

  - A_u

  Concern-detail evidence categories:

  - protected primary content absent:
      - concern body absent
  - protected related/secondary content absent:
      - response preview absent
  - authored-only actions absent:
      - any concern-detail-only action absent
  - safe-state route pattern matched:
      - same-route safe rendering or redirected safe route
  - recovery UI present

  Pass if:

  - stale concern access resolves to the same safe-state class as U6
  - the final settled route matches one of the allowed concern-detail safe-state patterns
  - protected primary content is absent
  - protected related/secondary content is absent
  - authored-only actions are absent
  - recovery UI is present

  ### U8. authored response detail unauthorized handling for responder

  Prerequisite:

  - Artifact set A complete

  Actor:

  - B_u

  Response-detail evidence categories:

  - protected primary content absent:
      - response body absent
  - protected related/secondary content absent:
      - no additional protected secondary content exists on this screen; this category is intentionally empty beyond verifying no extra
        protected detail content appears
  - authored-only actions absent:
      - 해당 고민으로 돌아가기 absent
  - safe-state route pattern matched:
      - same-route safe rendering or redirected safe route
  - recovery UI present

  Pass if:

  - B_u is fully onboarded and already inside the normal app flow
  - denial happens after normal authenticated app access was established
  - access is denied despite B_u being the actual responder
  - the final settled route matches one of the allowed response-detail safe-state patterns
  - protected primary content is absent
  - protected related/secondary content is absent
  - authored-only actions are absent
  - recovery UI is present

  ### U9. authored response detail unauthorized handling for unrelated onboarded user

  Prerequisite:

  - Artifact set A complete
  - E_u exists and is authenticated and fully onboarded
  - E_u is created only after Artifact set A proof is complete

  Actor:

  - E_u

  Response-detail evidence categories:

  - protected primary content absent:
      - response body absent
  - protected related/secondary content absent:
      - no additional protected secondary content exists on this screen; this category is intentionally empty beyond verifying no extra
        protected detail content appears
  - authored-only actions absent:
      - 해당 고민으로 돌아가기 absent
  - safe-state route pattern matched:
      - same-route safe rendering or redirected safe route
  - recovery UI present

  Pass if:

  - bootstrap and onboarding are already satisfied for E_u
  - denial happens after normal authenticated app access was established
  - access is denied because of ownership mismatch
  - the final settled route matches one of the allowed response-detail safe-state patterns
  - protected primary content is absent
  - protected related/secondary content is absent
  - authored-only actions are absent
  - recovery UI is present

  ### U10. authored response detail stale handling

  Prerequisite:

  - Artifact set A complete

  Actor:

  - A_u

  Response-detail evidence categories:

  - protected primary content absent:
      - response body absent
  - protected related/secondary content absent:
      - no additional protected secondary content exists on this screen; this category is intentionally empty beyond verifying no extra
        protected detail content appears
  - authored-only actions absent:
      - 해당 고민으로 돌아가기 absent
  - safe-state route pattern matched:
      - same-route safe rendering or redirected safe route
  - recovery UI present

  Pass if:

  - stale response access resolves to the same safe-state class as U8/U9
  - the final settled route matches one of the allowed response-detail safe-state patterns
  - protected primary content is absent
  - protected related/secondary content is absent
  - authored-only actions are absent
  - recovery UI is present

  ### U11. response detail returns to the correct authored concern

  Prerequisite:

  - Artifact set A complete
  - U5a and U5b have already passed for response_id_u

  Actor:

  - A_u

  Pass if:

  - the final settled route is /post-concern/my-concerns/[concern_id_u]
  - fixed concern body is visible again
  - returned concern matches the same concern_id_u artifact used in U3/U4a/U5a/U5b

  ### N1. DB-proven real notification row is visible in /notifications

  Prerequisite:

  - Artifact set B complete
  - U2 has already passed

  Actor:

  - A_u

  Success evidence categories:

  - target artifact represented in UI:
      - one visible notification row is treated as the target row
  - target artifact identity tied to DB linkage:
      - the row is backed by notification_id_u
      - DB proves notification_id_u -> response_id_u -> concern_id_u
      - visible notification content and placement are sufficient to distinguish the chosen row from other visible rows in the current list
        state
  - target element actionable:
      - that exact row is tappable for use in N2a
  - no ambiguity with another visible candidate element:
      - no second visible notification row qualifies equally as the target without a reliable way to distinguish them

  Pass if:

  - the target notification row backed by notification_id_u is present in the UI
  - the chosen row is identified as the target by visible row evidence plus DB linkage before the tap result is used
  - that exact row is actionable
  - the visible target row is the row linked in DB to response_id_u
  - additional notification rows may exist, but they do not fail this scenario unless they prevent unambiguous identification or interaction
    with the target row

  Fail if:

  - no visible notification row can be identified confidently as notification_id_u
  - more than one visible row is an equally plausible target and the plan cannot distinguish which one is notification_id_u
  - an actionable row exists but its identity as the target row is not defensible
  - additional rows make the target row ambiguous for validation purposes

  ### N2a. notification tap navigation success

  Prerequisite:

  - Artifact set B complete
  - N1 has already passed

  Actor:

  - A_u

  Pass if:

  - tapping the notification row identified in N1 reaches /post-concern/my-concerns/responses/[response_id_u]
  - the final settled route is /post-concern/my-concerns/responses/[response_id_u]

  ### N2b. notification-driven response-detail rendering success

  Prerequisite:

  - Artifact set B complete
  - N2a has already passed

  Actor:

  - A_u

  Pass if:

  - on the settled route /post-concern/my-concerns/responses/[response_id_u], full response body equals fixed response body
  - destination corresponds to notification_id_u and response_id_u, not merely any readable response detail

  ### N3. notification path returns to the correct concern

  Prerequisite:

  - Artifact set B complete
  - N2a and N2b have already passed

  Actor:

  - A_u

  Pass if:

  - from notification-driven response detail, tapping 해당 고민으로 돌아가기
  - the final settled route is /post-concern/my-concerns/[concern_id_u]
  - fixed concern body is visible
  - returned concern matches the same concern_id_u artifact used for the notification-producing response

  ## Supporting-Only Scenarios

  These may be observed and reported, but cannot block closure by themselves.

  - empty-state observation with D_u
  - transient loading-state observation
  - denial for onboarding-incomplete user C_u
  - notification list cleanliness observation when only the target notification row is present
  - broader regression notes outside the Phase 6 authored-flow closure path

  If C_u denial is observed, report it explicitly as onboarding-gated denial, not ownership-based denial.

  ## TODO.md Mapping

  Update TODO.md only after the required essential evidence exists.

  ### Section 10 item 1

  Post concern 내부에 My concerns 목록을 구현한다.

  May be checked only if:

  - U1 proves /inbox -> /post-concern -> /post-concern/my-concerns reachability
  - U3 proves the authored concern created in the current run dataset is visible from the list and opens to the exact same concern_id_u

  ### Section 10 item 2

  내가 작성한 실제 고민의 상세 화면을 구현한다.

  May be checked only if:

  - U4a passes
  - U6 passes with fully onboarded unrelated user E_u
  - U7 passes
  - all three are validated against the same concern_id_u

  ### Section 10 item 3

  내 고민에 달린 답변 목록/상세 화면을 구현한다.

  May be checked only if:

  - U4b passes
  - U5a passes
  - U5b passes
  - U8 passes
  - U9 passes with fully onboarded unrelated user E_u
  - U10 passes
  - U11 passes
  - all seven are validated against the same response_id_u

  ### Section 10 item 4

  알림에서 해당 고민/답변 상세로 진입할 수 있게 한다.

  May be checked only if:

  - U2 passes
  - Artifact set B is DB-proven
  - N1 proves the target notification row is visible and actionable in UI
  - N2a proves that target row navigates to the correct authored response detail
  - N2b proves correct response-detail rendering for notification_id_u and response_id_u
  - N3 proves correct return navigation to concern_id_u

  No partial evidence is sufficient for any item.

  ## Closure Standard

  Phase 6 is closed only if:

  - Artifact set A exists
  - Run R essential scenarios R1-R8 all pass
  - Run U authored-flow essential scenarios U1-U3, U4a, U4b, U5a, U5b, U6-U11 all pass
  - Artifact set B exists
  - notification essential scenarios N1, N2a, N2b, N3 all pass
  - no unauthorized or stale authored route leaks protected concern or response body
  - TODO.md exactly matches the validated evidence

  Phase 6 is not closed if:

  - any essential sub-scenario fails
  - any essential sub-scenario is blocked by missing prerequisite artifacts
  - notification-driven validation is blocked because Artifact set B is missing
  - TODO.md overstates completion

  ## Final Report Structure

  ### Files changed

  - exact list
  - if none: None

  ### Prerequisite artifact proof

  - fresh reset proof
  - environment preflight proof
  - Artifact set A proof:
      - concern_id
      - delivery_id
      - response_id
      - author user
      - recipient user
      - linkage concern -> delivery -> response
  - Artifact set B proof:
      - target notification_id_u
      - profile_id
      - type
      - related_entity_type
      - related_entity_id
      - linkage notification_id_u -> response_id_u -> concern_id_u
  - if additional notification rows exist:
      - identify them separately as additional observed rows
      - state whether they were irrelevant or whether they interfered with target-row validation
  - or explicit statement that Artifact set B was missing

  ### Essential scenario coverage summary

  List every essential scenario and sub-scenario ID separately and mark each as exactly one of:

  - passed
  - failed
  - blocked

  At minimum list separately:

  - U4a
  - U4b
  - U5a
  - U5b
  - N2a
  - N2b

  ### Executed essential scenarios

  For each executed essential scenario or sub-scenario:

  - Scenario ID
  - prerequisite artifacts satisfied
  - acting user
  - input IDs
  - exact action
  - observed route
  - observed authored data visibility or non-visibility
  - DB result if applicable
  - for every success scenario that is supposed to resolve a specific artifact, state which exact artifact ID was proven by the result:
      - concern-detail success tied to concern_id_u
      - response-detail success tied to response_id_u
      - notification-driven response-detail success tied to notification_id_u and response_id_u
      - return navigation tied back to concern_id_u
  - pass/fail

  ### Success-path UI evidence notes

  For U3, U4b, and N1, the report must explicitly record:

  - what visible UI element was treated as the target artifact
  - what visible evidence identified that element before navigation was used
  - what evidence tied that element to the intended artifact ID
  - whether the target element was actionable where required
  - whether any competing visible candidate elements existed
  - why the chosen element was considered unambiguous
  - if ambiguity remained, why the scenario failed

  ### RPC result-shape notes

  For each RPC success scenario in Run R, report separately:

  - required fields present/correct
  - extra fields observed, if any
  - whether those extra fields were considered:
      - benign
      - contract-violating
      - security-relevant

  Extra fields must not fail closure by default unless they create a real contract or security problem.

  ### Notification row notes

  For notification validation in Run U, report separately:

  - the exact target notification row validated in this run:
      - notification_id_u
      - linked response_id_u
      - linked concern_id_u
  - whether the target row was visible and actionable in UI
  - any additional notification rows observed
  - whether those additional rows were irrelevant, or whether they interfered with unambiguous validation of the target row

  Additional rows do not fail closure by default unless they block or invalidate validation of the target notification path.

  ### Blocked essential scenarios

  List every essential scenario or sub-scenario not executed because prerequisites were missing:

  - Scenario ID
  - missing prerequisite artifact
  - why that artifact was missing
  - whether the blocker is environment failure or shared dependency blocker

  ### Phase 6 defects

  - only failures in the Phase 6-added surface

  ### Shared dependency blockers

  - prerequisite artifact creation failures that prevented closure

  ### TODO.md updates

  - Yes or No
  - exact section 10 items changed
  - for every checked item, cite the exact scenario IDs that justified it
  - for every unchecked item, state explicitly whether that was due to:
      - failed scenario(s)
      - blocked prerequisite artifact(s)
      - missing execution

  ### Authorization evidence breakdown

  Must separately list which unauthorized scenarios were validated with:

  - fully onboarded unrelated users
  - onboarding-incomplete users

  Use the same evidence-category structure for both concern-detail and response-detail comparisons:

  - protected primary content absent
  - protected related/secondary content absent
  - authored-only actions absent
  - safe-state route pattern matched
  - recovery UI present

  For response-detail scenarios, the report must explicitly note that the protected related/secondary content surface is intentionally
  narrower than concern detail:

  - primary protected content is the response body
  - there is no additional protected secondary content beyond ensuring no extra protected detail content appears
  - authored-only action is 해당 고민으로 돌아가기

  For each of:

  - U6
  - U7
  - U8
  - U9
  - U10

  the report must explicitly record:

  - actor identity and onboarding state
  - attempted route
  - final settled route
  - whether recovery UI appeared
  - whether protected primary content was absent
  - whether protected related/secondary content was absent
  - whether authored-only actions were absent
  - which allowed safe-state pattern matched:
      - same-route safe rendering
      - redirected safe route
  - or, if none matched, why the result failed

  For stale scenarios specifically:

  - U7 must cite which earlier ownership-denied scenario it matched against and whether any observable difference remained
  - U10 must cite which earlier ownership-denied scenario(s) it matched against and whether any observable difference remained

  ### Closure verdict

  Must state one of:

  - Phase 6 closed
  - Phase 6 not closed because essential scenarios failed
  - Phase 6 not closed because essential scenarios were blocked by missing prerequisite artifacts
  - Phase 6 not closed because essential scenarios failed and others were blocked by missing prerequisite artifacts

  A generic undifferentiated Phase 6 not closed is not allowed.

  ## Assumptions

  - Fresh DB reset is mandatory before each run.
  - Two-run validation remains the smallest reliable design in this repository.
  - Expo web is the UI validation surface.
  - Exact body matching is valid evidence because it identifies authored test data, not UI copy.
  - Additional notification rows may exist locally and are not phase-failing by default unless they make the target notification row
    ambiguous or invalidate the notification-path checks.
  - No repo mutation is allowed before an observed Phase 6 mismatch.
