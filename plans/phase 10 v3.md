# Phase 10 v3 Final Implementation Plan

## Controlled Cohort Assumptions

- This phase targets the prototype user-test cohort of about 10 known users.
- The concern author is excluded from routing, so the effective routing pool is the other 9 users.
- Users in this cohort are assumed to complete onboarding correctly.
- This phase does not add a generalized degraded-routing product design for low-candidate cases.
- Initial routing for every real concern remains exactly 3 recipients.
- No later time-based reassignment is implemented in this phase.

## TODO Audit

### Must close in Phase 10 v3

- ## 1 My concerns remains nested inside Post concern, with no separate bottom tab.
- ## 1 first real app screen remains Inbox.
- ## 1 real-concern initial routing contract is closed to exactly 3 recipients.
- ## 1 example concern exclusion bundle is fully closed.
- ## 3 profiles schema finalization and routing-eligibility closure.
- ## 4 self-delivery final block.
- ## 4 already-responded candidate re-selection prohibition.
- ## 5 blocked concern/response/feedback-comment moderation persistence closed to audit-only storage.
- ## 5 approved concern/response/feedback-comment persistence closed to product-row plus linked audit only.
- ## 5 moderation audit storage explicit closure, including minimum operator visibility.
- ## 7 Post concern tab closure.
- ## 7 Notifications tab closure.
- ## 12 example-concern exclusion bundle.
- ## 15 DB / server / app responsibility split closure.
- ## 17 minimum pre-Phase-11 logging.
- ## 17 example concern events separated from default analytics.
- ## 17 operator moderation visibility.

### Deferred to Phase 11 Testing only

- ## 16 migration tests.
- ## 16 RLS/policy tests.
- ## 16 moderation persistence tests.
- ## 16 real-user-flow E2E scenarios.

### Deferred past Phase 11

- ## 0 document-baseline confirmation checklist.
- ## 1 reinstall identity recovery out of scope.
- ## 2 stack/setup/repository/env/global-bootstrap checklist.
- ## 17 deployment/distribution environment work.
- ## 18 final scope/writing/Must-Have audit.

## Routing Contract

- Real-concern initial routing target is exactly 3 recipients.
- The LLM may choose from the full allowable user pool after hard server exclusions.
- Hard exclusions remain unchanged:
self-delivery forbidden;
already assigned for the same concern forbidden;
already responded for the same concern forbidden;
blocked users forbidden;
inactive users forbidden;
users missing required routing attributes forbidden.
- No later time-based reassignment is implemented in this phase.

### Unexpected Invariant Failure Handling

- If allowable_pool < 3 is unexpectedly encountered at runtime, this is treated as an invariant failure, not a normal success and not a
normal no_delivery.
- The server returns a retriable application failure for concern submission.
- No deliveries are created.
- No in-app notifications are created.
- No push is sent.
- An explicit server error log is emitted with the invariant-failure code.
- This path is operationally out of scope for the controlled cohort, but it is still defined and handled explicitly.

### Approved Concern + Routing Invariant Failure Behavior

- The approved concern row does not remain persisted.
- Concern submission success is defined only when all of these are true:
moderation approved;
3 recipients selected;
concern row written;
deliveries written;
concern-delivered notifications written.
- If routing invariant failure happens after moderation approval but before that full write completes, the submission is treated as
failed, not partially successful.
- The author sees a retryable submit failure on the compose screen using the existing retry-style failure UX, not success-with-warning.
- The draft body remains preserved so the author can retry.
- No authored concern appears in My concerns.
- No authored concern detail screen is reachable from this failed attempt.
- This state is internal-only operational failure, not a visible normal submitted concern and not a visible failed concern record.
- No Phase 10 v3 TODO line may be checked if this behavior is left undefined.

## Profiles Schema Finalization: Defensible Closure Rule

### Already satisfied by existing DB schema / constraints

- profiles.id = auth.users.id 1:1:
already satisfied by public.profiles.id uuid primary key references auth.users(id) on delete cascade in
20260417230000_mvp_db_foundation.sql.
- onboarding_completed required boolean:
already satisfied by onboarding_completed boolean not null default false.
- gender required when onboarding is complete:
already satisfied by profiles_onboarding_requires_gender_chk check (not onboarding_completed or gender is not null).
- routing-eligibility fields present:
already satisfied by is_active boolean not null default true and is_blocked boolean not null default false.
- routing actually uses those fields:
already satisfied by src/features/routing/server/runtime-state.ts and src/features/routing/server/eligibility.ts.

### Closed in Phase 10 v3 by ownership / path hardening

- onboarding_completed remains server-owned:
preserved through public.complete_onboarding(...); no direct client UPDATE profiles path is introduced.
- protected profile fields remain non-client-mutable:
there is no direct client update grant/policy on public.profiles;
post-onboarding edits remain limited to public.update_my_profile_interests(...).
- profile summary and solved-count semantics become server-owned reads:
closed in this phase by moving solved-count access from client-callable DB RPC to get-profile-summary.

### Why the TODO item is checkable without new profile columns

- Every schema-field requirement in ## 3 is already satisfied by a concrete existing DB object.
- The remaining work is ownership/path closure, not missing columns.
- Phase 10 v3 closes that remaining ownership gap.
- Therefore ## 3 profiles schema finalization is defensibly checkable after this phase even without a profile-column migration.

## Public API / Interface Changes

- Add supabase/functions/get-profile-summary/index.ts.
Return shape remains { id, gender, onboardingCompleted, interestKeys, solvedCount }.
- Add service-role-only SQL function public.list_moderation_audit_entries_for_operator(...).
- Add repo-local operator command moderation:audit backed by scripts/list-moderation-audit.mjs.
- Add a new service-role-only SQL write path for concern submission success semantics:
one function that writes the approved concern row, linked moderation audit row, deliveries, and concern-delivered notifications together
after recipient selection is already known.
- Add explicit routing invariant failure code such as routing_invariant_allowable_pool_too_small.
- Revoke authenticated direct INSERT on public.responses and remove the direct insert policy.
- Revoke authenticated execute on public.get_my_solved_count().

## Step-by-Step File-Level Plan

### Step 1. Lock navigation and information architecture

- Add src/features/navigation/contracts.ts.
Define:
visible bottom tabs exactly Inbox / Post concern / Notifications / Profile;
hidden bootstrap routes index and onboarding;
canonical first real route /inbox;
allowed tab-bar-visible paths.
- Update app/_layout.tsx.
Work type: tightening.
TODO impact:
## 1 bottom navigation contract;
## 1 app first screen Inbox.
- Update app/post-concern/_layout.tsx.
Work type: tightening.
TODO impact:
## 1 My concerns nested structure;
## 7 Post concern tab closure.
- Add src/features/navigation/contracts.test.ts.
Work type: support verification only.
- Update src/features/session/gate.test.ts.
Work type: support verification only.

### Step 2. Close DB/RLS/server-write gaps with one migration

- Add supabase/migrations/<timestamp>_phase10_v3_contract_closure.sql.
- Revoke authenticated direct response creation on public.responses.
Drop responses_insert_recipient_only.
Work type: implementation.
TODO impact:
## 5 blocked response audit-only persistence;
## 5 approved response persistence path;
## 15 server ownership of moderation writes.
- Revoke authenticated execute on public.get_my_solved_count().
Work type: implementation.
TODO impact:
## 15 server ownership of solved-count semantics.
- Add public.list_moderation_audit_entries_for_operator(...) as service-role-only.
Work type: implementation.
TODO impact:
## 5 moderation audit explicit closure;
## 17 operator moderation visibility.
- Add a new service-role-only SQL function for successful approved concern persistence after routing selection.
Inputs:
actor profile id;
raw submitted text;
validated body;
moderation payload;
ordered 3 recipient ids.
Writes in one transaction:
concern row;
linked moderation audit row;
concern deliveries;
concern-delivered notifications.
Work type: implementation.
TODO impact:
## 5 approved concern persistence;
## 8 approved => concern row + routing;
## 15 server ownership of routing execution.
- Remove use of the old “approved concern row first, route later” success path from Phase 10 v3 concern submit flow.
Work type: implementation.
- Update response notification SQL function to return concern_source_type or equivalent logging-scope metadata.
Work type: implementation.
TODO impact:
## 12 example concern analytics exclusion;
## 17 example-event separation.

### Step 3. Correct routing to the controlled-cohort 3-recipient contract

- Update src/features/routing/server/eligibility.ts.
Replace current computeRequiredDeliveryCount() logic so real concerns require 3.
Work type: implementation.
TODO impact:
## 1 initial routing target is 3 recipients.
- Update src/features/routing/contracts.ts.
Add explicit invariant failure code such as routing_invariant_allowable_pool_too_small.
Work type: implementation.
- Update src/features/routing/server/route-concern-service.ts.
Work type: implementation.
Changes:
remove normal 1-recipient and 2-recipient success behavior;
require exactly 3 validated recipients for routing success;
preserve hard exclusions before model selection;
if filtered allowable pool is below 3, return explicit invariant failure and no success result.
- Update src/features/routing/server/openai-routing.ts.
Work type: tightening.
Change:
require exact-count output of 3 ids for real concerns.
- Update supabase/functions/submit-concern/index.ts.
Work type: implementation.
Change:
moderation approval alone no longer commits a visible concern;
the Edge Function selects recipients first, then calls the new atomic approved-concern write path;
if routing invariant failure occurs, return retryable failure and keep the attempt non-persisted in product tables.
- Update routing tests:
src/features/routing/server/eligibility.test.ts
src/features/routing/server/route-concern-service.test.ts
src/features/routing/server/openai-routing.test.ts if needed.
Work type: support verification only.

### Step 4. Section 7 closure rule

For every section-7 sub-item below:

- If inspection confirms it is already fully implemented and wired, Phase 10 v3 only verifies/tightens it and then checks the TODO line.
- If inspection finds any missing piece, the phase patches that missing behavior in the exact files named below before the TODO line is
checked.

### Step 5. Section 7 implementation matrix: Post concern

#### 5.1 Compose flow

- Current status: appears already present.
- Files to inspect/change:
app/post-concern/index.tsx
src/features/concerns/api.ts
src/features/concerns/server/submit-concern-service.ts
supabase/functions/submit-concern/index.ts
- Work type:
verify/tighten if complete;
implementation if atomic success semantics are missing.
- If missing:
patch submit flow so success is returned only after the new atomic approved-concern write succeeds.
- TODO line checkable:
## 7 Post concern 탭을 구현한다
## 8 고민 작성 화면을 구현한다

#### 5.2 Blocked draft preservation

- Current status: appears already present.
- Files to inspect/change:
app/post-concern/index.tsx
- Work type:
verify/tighten if complete;
implementation if blocked result clears or mutates the draft.
- If missing:
patch blocked branch so draftBody is untouched and only approved submit clears it.
- TODO line checkable:
## 8 부적절한 고민 차단 UX
body-preservation sub-lines.

#### 5.3 Retry after edit

- Current status: appears already present.
- Files to inspect/change:
app/post-concern/index.tsx
src/features/concerns/api.ts if failure normalization is the gap.
- Work type:
verify/tighten if complete;
implementation if blocked or retriable failures leave the screen in a non-retryable state.
- If missing:
patch blocked/retryable error branches so the user stays on the same compose screen with preserved draft and can resubmit after editing.
- TODO line checkable:
## 8 부적절한 고민 차단 UX
retry-after-edit sub-line.

#### 5.4 Nested My concerns navigation

- Current status: appears already present.
- Files to inspect/change:
app/post-concern/index.tsx
app/post-concern/_layout.tsx
app/post-concern/my-concerns/index.tsx
app/post-concern/my-concerns/[concernId].tsx
- Work type:
verify/tighten if complete;
implementation if entry/navigation is not fully nested or submit success does not land in the nested authored flow.
- If missing:
patch route targets and stack registration so My concerns is reachable only inside Post concern and approved submit routes into that
nested stack.
- TODO line checkable:
## 1 My concerns nested structure
## 7 Post concern 탭을 구현한다

### Step 6. Section 7 implementation matrix: Notifications

#### 6.1 Notification permission flow

- Current status: appears already present.
- Files to inspect/change:
src/features/notifications/push-registration.ts
app/_layout.tsx
- Work type:
verify/tighten if complete;
implementation if ready-profile revalidation or permission prompting is not actually wired.
- If missing:
patch startup registration hook wiring in app/_layout.tsx or permission/request sequencing in push-registration.ts.
- TODO line checkable:
## 13 Expo Notifications 권한 요청 및 토큰 등록 흐름

#### 6.2 Token registration/update

- Current status: appears already present.
- Files to inspect/change:
src/features/notifications/push-registration.ts
supabase/migrations/20260419010000_phase8_notifications_push.sql
- Work type:
verify/tighten if complete;
implementation if self-only sync/update semantics are broken.
- If missing:
patch sync_my_push_token usage or SQL self-only behavior.
- TODO line checkable:
## 13 사용자는 자신의 push token만 등록/수정

#### 6.3 Notification creation types

- Current status: appears already present.
- Files to inspect/change:
supabase/functions/submit-concern/index.ts
supabase/functions/submit-response/index.ts
supabase/functions/save-response-feedback/index.ts
concern/response/feedback notification-writing SQL functions in supabase/migrations/20260419010000_phase8_notifications_push.sql and
supabase/migrations/20260419153000_phase10_feedback_moderation_hardening.sql
src/features/notifications/types.ts
- Work type:
verify/tighten if complete;
implementation if any non-documented type can still be written or if any documented flow is mis-typed.
- Closure rule:
only these app notification types may ever be created:
concern_delivered
response_received
response_liked
response_commented
- If missing:
patch edge-function emitters, SQL notification writers, and shared type usage so all creation sites are restricted to the documented
enum set only.
- TODO line checkable:
## 13 앱 알림 타입을 구현한다

#### 6.4 Notifications live list/read behavior

- Current status: appears already present.
- Files to inspect/change:
app/notifications/index.tsx
src/features/notifications/api.ts
src/features/notifications/mappers.ts
src/features/notifications/types.ts
- Work type:
verify/tighten if complete;
implementation if the screen is only a navigation shell, does not read real rows, or does not behave as the live in-app notification
surface.
- Closure rule:
the Notifications tab must read real public.notifications rows and serve as the live in-app list/read surface, not merely a placeholder
screen.
- If missing:
patch the query, mapping, screen state, and render path so the tab loads and renders real notification rows as the authoritative in-app
list.
- TODO line checkable:
## 7 Notifications 탭을 구현한다

#### 6.5 read_at handling

- Current status: appears already present.
- Files to inspect/change:
src/features/notifications/api.ts
app/notifications/index.tsx
app/_layout.tsx
existing SQL mark_notification_read path.
- Work type:
verify/tighten if complete;
implementation if marking read is not consistently using the RPC or if unread state is not reflected from read_at.
- If missing:
patch all read-marking entry points to use mark_notification_read and consume read_at as the only read state.
- TODO line checkable:
## 13 알림 읽음 처리는 read_at 갱신

#### 6.6 Notification-to-detail navigation

- Current status: appears already present.
- Files to inspect/change:
src/features/notifications/navigation.ts
app/notifications/index.tsx
app/_layout.tsx
- Work type:
verify/tighten if complete;
implementation if any notification type maps to the wrong pathname or push-open behavior differs from in-app tap behavior.
- If missing:
patch route mapping in navigation.ts and the caller usage sites in the notifications screen and root notification-response handler.
- TODO line checkable:
## 10 알림에서 해당 고민/답변 상세로 진입
## 7 Notifications 탭을 구현한다

#### 6.7 Example-concern notification exclusion

- Current status: appears mostly present but must be re-verified end to end.
- Files to inspect/change:
supabase/functions/submit-concern/index.ts
supabase/functions/submit-response/index.ts
supabase/functions/save-response-feedback/index.ts
notification-writing SQL functions in migrations.
- Work type:
verify/tighten if complete;
implementation if any example concern path still creates app notifications or push, or still enters default analytics.
- If missing:
patch server-side notification creation guards and analytics tagging at the edge-function layer and SQL write path as needed.
- TODO line checkable:
## 13 예제 고민 관련 알림은 만들지 않는다
## 12 예제 고민은 push/feedback/solved-count/기본 분석 대상에서 제외한다

### Step 7. Move profile summary and solved-count behind a server-owned path

- Add src/features/profile/server/profile-summary-service.ts.
Work type: implementation.
TODO impact:
## 15 server ownership of solved-count semantics;
supports defensible closure of ## 3 profiles schema finalization.
- Add supabase/functions/get-profile-summary/index.ts.
Work type: implementation.
- Update src/features/profile/api.ts.
Work type: implementation.
Change:
getMyProfileSummary() invokes get-profile-summary instead of mixing direct reads plus get_my_solved_count().
- Update app/profile/index.tsx only if needed.
Work type: tightening.
- Add/update:
src/features/profile/server/profile-summary-service.test.ts
src/features/profile/api.test.ts
Work type: support verification only.

### Step 8. Complete minimum logging and example-event exclusion

- Add supabase/functions/_shared/event-log.ts.
Work type: implementation.
- Update src/lib/logger.ts.
Work type: implementation.
- Update app/onboarding.tsx.
Work type: implementation.
TODO impact:
## 17 온보딩 완료.
- Update supabase/functions/submit-concern/index.ts.
Work type: implementation.
TODO impact:
concern attempt/approved/blocked logs;
routing selection result;
invariant failure logging;
push success/failure.
- Update src/features/routing/server/route-concern-service.ts.
Work type: implementation.
TODO impact:
routing selection result and invariant-failure logging.
- Update src/features/responses/server/submit-response-service.ts.
Work type: implementation.
TODO impact:
example-event exclusion from default analytics.
- Update supabase/functions/submit-response/index.ts.
Work type: implementation.
TODO impact:
response attempt/approved/blocked logs;
push success/failure.
- Update supabase/functions/save-response-feedback/index.ts and handler.ts.
Work type: implementation.
TODO impact:
feedback submitted log;
example/no-op/blocked exclusion from default analytics.
- Update supabase/functions/_shared/expo-push.ts.
Work type: implementation.
TODO impact:
deterministic push success/failure logging.

### Step 9. Add the minimum operator visibility path for moderation audit

- Add scripts/list-moderation-audit.mjs.
Work type: implementation.
- Update package.json.
Add moderation:audit.
Work type: implementation.
- Minimum supported operator contract:
default output shows recent entries only;
default limit is 20;
supports --limit;
supports optional simple filters --subject-type and --blocked;
shown fields are:
checked_at
subject_type
actor_profile_id
blocked
approved_entity_type
approved_entity_id
summarized category_summary
truncated raw_submitted_text
indicator that raw provider payload exists.
Optional verbose flag may print full provider payload for operator debugging.
- Narrowness:
read-only;
no app UI;
no arbitrary querying surface;
only recent-listing plus simple filters;
service-role-only access stays outside client paths.
- TODO line checkable:
## 17 운영자가 moderation 결과를 audit 저장소 기준으로 확인할 수 있게 한다.

### Step 10. Update TODO.md conservatively after code completion

- Update TODO.md only where code in this phase fully closes the item.
- Only correct the specific obsolete routing bullets that still encode the older deliver 1 or 2 only contract.
Do not broadly rewrite TODO wording.
Do not weaken the initial-3-recipient contract.
- Expected checked items after implementation:
## 1 My concerns nested structure;
## 1 first app screen Inbox;
## 1 real concern initial 3-recipient routing contract;
## 1 example concern exclusion bundle;
## 3 profiles schema finalization;
## 4 self-delivery final block;
## 4 already-responded candidate re-selection prohibition;
## 5 blocked content audit-only persistence;
## 5 approved content product-row plus linked audit persistence;
## 5 moderation audit explicit closure;
## 7 Post concern tab;
## 7 Notifications tab;
## 12 example concern exclusion bundle;
## 15 DB/server/app responsibility split;
## 17 minimum MVP logging;
## 17 example-event separation;
## 17 operator moderation visibility.

## Test Plan

- Add only narrow support tests in this phase.
- src/features/navigation/contracts.test.ts: exact tabs and nested-route contract.
- src/features/session/gate.test.ts: first real screen remains Inbox.
- src/features/routing/server/eligibility.test.ts: no normal 1/2-recipient routing path remains.
- src/features/routing/server/route-concern-service.test.ts: routing success requires exactly 3 validated recipients; invariant failure is
explicit and non-success.
- src/features/notifications/api.test.ts: Notifications tab query path reads and maps real rows.
- src/features/notifications/navigation.test.ts: notification-to-detail navigation stays correct.
- src/features/notifications/mappers.test.ts or targeted notification-render test if needed: read/unread state is derived from read_at.
- targeted server notification tests in:
src/features/responses/server/submit-response-service.test.ts
supabase/functions/save-response-feedback/handler.test.ts
and if needed src/features/concerns/server/submit-concern-service.test.ts
verify only documented notification types are created.
- src/features/profile/server/profile-summary-service.test.ts: solved-count remains real-only positive-feedback derived.
- src/features/profile/api.test.ts: app-facing summary shape preserved through the new Edge Function.
- src/features/concerns/server/submit-concern-service.test.ts: concern submit success requires atomic approved concern + routing write;
invariant failure returns retryable failure and leaves no visible concern.
- supabase/functions/_shared/expo-push.test.ts: push summary is returned for caller logging.

## Assumptions and Defaults

- docs/ remains untouched.
- The current implementation target is the controlled prototype cohort, not a generalized degraded-routing product design.
- Real-concern initial routing target is exactly 3 recipients.
- The LLM may choose from the full allowable user pool after hard exclusions.
- Under the controlled cohort assumption, generalized low-candidate product behavior is out of scope.
- If allowable_pool < 3 is unexpectedly encountered at runtime, it is treated as an invariant failure:
not a success;
not no_delivery;
no concern visible in product state;
no deliveries/notifications created;
explicit retryable failure returned to the client;
explicit error log emitted.
- No later time-based reassignment will be implemented.
- profiles does not require new columns or new table constraints after inspection.
- The minimum defensible operator visibility path is a service-role-only retrieval function plus a repo-local read-only operator command,
not a public endpoint and not an app dashboard.
