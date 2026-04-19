## 1. Revised Summary

Phase 8 remains narrowly scoped to notifications and push:

- finish authoritative in-app notification creation for:
    - concern_delivered
    - response_received
    - response_liked
    - response_commented
- add Expo permission + push-token registration
- send Expo pushes only after DB writes commit
- complete notifications screen read/navigation behavior
- expose feedback results to response authors in inbox detail
- update TODO.md only for items actually implemented
- do not touch docs/

Locked product and implementation rules for this phase:

- onboarding-readiness for push registration must reuse the same predicate used by src/features/session/gate.ts
- root-layout push registration uses a separate minimal profile read because there is no shared profile context there today
- foreground/profile revalidation is explicitly serialized and cooldown-coalesced
- response_liked notifies only on false/null -> true
- response_commented notifies only on first comment creation:
    - later edits, clears, and re-saves do not notify
- read_at is DB-clock-owned via mark_notification_read(...)
- push payloads use one exact normalized contract:
    - notificationId
    - type
    - relatedEntityType
    - relatedEntityId
- push delivery verification claims must stay proportional to what was actually proven:
    - real-device smoke check if possible
    - otherwise explicit fallback reporting

## 2. Full Step-by-Step Implementation Plan

### Step 1. Reuse the existing onboarding-readiness rule exactly

Current source of truth:

- src/features/session/gate.ts
- decideGateRoute(...)

Current readiness predicate:

- profile.onboardingCompleted === true
- profile.gender !== null

Implementation rule:

- do not add a second push-registration predicate
- extract the predicate into an exported helper in src/features/session/gate.ts, e.g. isProfileReadyForInbox(profile)
- both:
    - decideGateRoute(...)
    - push-registration logic
    import and use that exact helper

### Step 2. Root-layout minimal profile read and push-registration lifecycle

Repository reality:

- SessionProvider exposes session only
- profile bootstrap state currently lives in app/index.tsx
- there is no shared profile context for app/_layout.tsx

Phase-8 choice:

- app/_layout.tsx performs a separate minimal profile read
- queried fields:
    - id
    - gender
    - onboarding_completed

Execution lifecycle:

- run only after session becomes non-null
- key all reads/runs by session.user.id
- skip entirely when session is null
- do not refetch on ordinary rerenders
- revalidate on:
    - session.user.id change
    - readiness transition to ready
    - app foreground transition to active

Foreground/profile revalidation policy:

- Optimize for fewer redundant profile reads, while still recovering on later foreground entries after external profile/permission
changes.
- Revalidation is governed by both:
    - a single in-flight guard for the current session.user.id
    - a time-based cooldown for completed runs for the current session.user.id

Behavior rules:

1. If no session exists:

- do nothing
- no profile read
- no permission/token flow

2. If a run is already in flight for the current session.user.id:

- do not start another run
- record one pending revalidation flag for that same user
- when the in-flight run completes:
    - if the pending flag is set, run exactly one more revalidation immediately
    - then clear the pending flag

3. If no run is in flight and the last completed revalidation for the current user is outside the cooldown window:

- start a fresh revalidation immediately

4. If no run is in flight and a foreground trigger happens inside the cooldown window:

- do not start an immediate revalidation
- drop that foreground trigger
- do not queue it as pending solely because it occurred during cooldown

5. Session/user change behavior:

- changing session.user.id always invalidates the previous user’s run state and cooldown state
- the new user is treated as uncached and may start a fresh revalidation immediately
- stale results from the old user must be ignored

6. Readiness-transition behavior:

- if the local profile state transitions from not-ready to ready for the current user, that transition may trigger the registration flow
immediately, independent of waiting for another foreground event
- this is not treated as a separate profile-read trigger if it comes directly from the just-completed read; it is the normal continuation
of that run

7. Failure behavior:

- if the minimal profile read fails, or token fetch/sync fails:
    - do not start an automatic timer-based retry
    - wait for the next allowed trigger:
        - session/user change
        - readiness transition to ready
        - foreground transition to active after cooldown

Explicit sequencing:

- permission prompting/token sync must wait until the minimal profile read for the current session user has completed successfully
- session existing alone is not enough to start push registration

Why this duplication is acceptable:

- it duplicates only a minimal read, not gate logic
- it avoids broadening scope into a global profile context refactor
- it is the smallest correct Phase-8 path in the current repo architecture

### Step 3. Add one additive migration for Phase 8

Create:

- supabase/migrations/20260419010000_phase8_notifications_push.sql

#### 3.1. Push token model

Keep:

- UNIQUE (expo_push_token)

Add:

- UNIQUE (profile_id, platform)

Intentional MVP limitation:

- one active token per user per platform
- latest synced install wins for that platform

#### 3.2. sync_my_push_token(...)

Add:

- public.sync_my_push_token(p_expo_push_token text, p_platform public.push_platform_type) returns void

Ownership:

- derive owner only from auth.uid()
- never accept caller-supplied profile_id

Blank/null branch:

- delete only caller’s row for:
    - profile_id = auth.uid()
    - platform = p_platform

Non-blank branch:

- normalize token with btrim
- use one transactional CTE-based replace strategy

Intended SQL shape:

with deleted_current as (
delete from public.push_tokens
where profile_id = auth.uid()
    and platform = p_platform
),
upserted as (
insert into public.push_tokens (
    profile_id,
    expo_push_token,
    platform
)
values (
    auth.uid(),
    v_normalized_token,
    p_platform
)
on conflict (expo_push_token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform
returning id
)
select 1;

Invariant after success:

- exactly one row for (auth.uid(), p_platform)
- sync of the same token transfers ownership to the current user
- any prior row for the same user/platform is replaced atomically

Security:

- schema: public
- SECURITY DEFINER
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- grant execute only to authenticated

#### 3.3. mark_notification_read(...)

Add:

- public.mark_notification_read(p_notification_id uuid) returns boolean

Why:

- read_at must come from DB now(), not client clock

Security:

- SECURITY INVOKER / default invoker semantics
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- grant execute only to authenticated

Intended SQL/function shape:

update public.notifications
set read_at = now()
where id = p_notification_id
and read_at is null;

- return boolean from row-count / FOUND semantics:
    - true unread->read
    - false zero rows updated

Ownership enforcement:

- rely on existing notifications_update_own RLS
- rely on existing notifications_read_at_only trigger
- no extra profile_id = auth.uid() predicate needed

Idempotence:

- repeated calls on already-read notifications are safe
- they return false
- never treated as an error path

Zero-row result intentionally collapses:

- already read
- missing
- inaccessible

#### 3.4. Routing wrapper

Keep unchanged:

- public.route_concern_atomic_write(...)

Add:

- public.route_concern_with_notifications_atomic_write(...) returns table (...)

Transaction boundary:

- delivery insert + notification insert occur in the same DB transaction
- returned rows are from those inserted rows
- push send happens only after the wrapper returns

Returned fields:

- delivery_id
- recipient_profile_id
- routing_order
- notification_id
- notification_profile_id
- notification_type
- notification_related_entity_type
- notification_related_entity_id

Notification contract:

- type = 'concern_delivered'
- related_entity_type = 'concern_delivery'
- related_entity_id = delivery_id

Example-concern handling:

- keep deterministic SQL exception semantics
- rationale:
    - in this service-role routing path, routing a non-real concern is an invariant breach
    - it is not a user-facing alternate success outcome

Security:

- schema: public
- SECURITY DEFINER
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- revoke execute from authenticated
- grant execute only to service_role

#### 3.5. Response submission wrapper

Keep unchanged:

- public.submit_response_with_moderation_audit(...)

Add:

- public.submit_response_with_notifications_and_moderation_audit(...) returns table (...)

Transaction boundary:

- response insert / delivery update / audit insert / notification insert are one DB transaction
- returned notification fields come from that transaction
- push send happens after commit

Real concern notification contract:

- type = 'response_received'
- related_entity_type = 'response'
- related_entity_id = response_id

Example-concern result shape:

- exactly one row:
    - response_id = created response id
    - result_code = 'approved'
    - notification_created = false
    - notification columns all null

Rationale:

- example concern response submission is valid
- only notification/push is excluded

Security:

- schema: public
- SECURITY DEFINER
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- revoke execute from authenticated
- grant execute only to service_role

#### 3.6. Feedback save wrapper

Add:

- public.save_response_feedback_with_notifications(...) returns table (...)

Transaction boundary:

- feedback write + notification insert(s) are one DB transaction
- returned notification rows come from that transaction
- push send happens only after wrapper success

Final Phase-8 product rule:

- response_liked notifies only on false/null -> true
- response_commented notifies only on first comment creation
- later comment edits, clears, and re-saves do not notify
- this final rule overrides any earlier broader wording

Liked delta rule:

- false/null -> true: create response_liked
- true -> true: no notification
- true -> false: no notification
- false -> false: no notification

Comment delta rule:

- null -> non-empty: create response_commented
- non-empty A -> same normalized non-empty A: no notification
- non-empty A -> different normalized non-empty B: no notification
- non-empty -> null: no notification
- whitespace-only -> normalize to null, no notification

Rationale:

- intentional MVP anti-spam behavior for edited feedback text

Combined save:

- liked + first comment together create exactly two notifications, in order:
    1. response_liked
    2. response_commented

No-op shape:

- exactly one row:
    - feedback_id = existing feedback id
    - result_code = 'no_op'
    - notification columns all null

Saved-without-notification edit cases:

- exactly one row:
    - feedback_id = saved feedback id
    - result_code = 'saved'
    - notification columns all null

Example-concern exclusion shape:

- exactly one row:
    - feedback_id = null
    - result_code = 'example_concern_not_allowed'
    - notification columns all null

Notification target:

- recipient = response author
- related_entity_type = 'concern_delivery'
- related_entity_id = response.delivery_id

Security:

- schema: public
- SECURITY DEFINER
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- revoke execute from authenticated
- grant execute only to service_role

#### 3.7. Recipient feedback-read RPC

Add:

- public.get_my_response_feedback_for_delivery(p_delivery_id uuid) returns table (...)

Behavior:

- return feedback only when:
    - delivery exists
    - recipient_profile_id = auth.uid()
    - underlying concern is real
- return zero rows for missing/inaccessible/example targets

Security:

- schema: public
- SECURITY DEFINER
- fixed search_path = public, private, pg_temp
- revoke execute from public
- revoke execute from anon
- grant execute only to authenticated

### Step 4. Shared notification route resolver

src/features/notifications/navigation.ts is the single shared owner of route resolution.

Separation of responsibilities:

- payload parsing validates primitive field shape
- route resolver accepts normalized notification target input only

Resolver contract:

- input:
    - { type, relatedEntityType, relatedEntityId }
- success:
    - Expo Router pathname/params object
- unsupported combination:
    - null

Both:

- DB-loaded notification rows
- validated push payloads
use the same resolver

### Step 5. Push payload composition and sending helpers

Add:

- src/features/notifications/server/push-message.ts
- src/features/notifications/server/push-message.test.ts
- supabase/functions/_shared/expo-push.ts

Exact push payload contract:

- all required, all strings:
    - notificationId
    - type
    - relatedEntityType
    - relatedEntityId

Validation:

- type must be known notification type
- relatedEntityType must be known related entity type
- relatedEntityId is expected UUID string
- any missing/malformed/unknown required field rejects payload before route resolution

notificationId rule:

- required for all Phase-8-generated pushes
- if missing or malformed:
    - no read mark
    - no navigation

Push-open parsing:

- parse exact payload
- validate to normalized target input
- pass to shared resolver

Stale-token cleanup:

- use service-role Supabase client
- delete by exact expo_push_token only on Expo DeviceNotRegistered

Push failure rule:

- push send is post-transaction only
- push failures never roll back product-state writes or notification rows

### Step 6. Edge-function integration points

#### 6.1. submit-concern

- call route_concern_with_notifications_atomic_write(...)
- use returned rows only for push send
- do not query later by concern id
- if wrapper throws non-real concern exception:
    - log invariant-breach server error
    - fail request
    - do not convert to fake success

#### 6.2. submit-response

- call submit_response_with_notifications_and_moderation_audit(...)
- use returned row only for push send
- do not query later by response/concern

#### 6.3. save-response-feedback

Add:

- supabase/functions/save-response-feedback/index.ts
- supabase/functions/save-response-feedback/deno.json

Behavior:

- authenticate caller
- resolve actor profile id
- validate payload
- call save_response_feedback_with_notifications(...)
- use returned rows only for push send

### Step 7. Replace client-direct feedback writes

Change:

- src/features/my-concern-responses/api.ts
- src/features/my-concern-responses/api.test.ts
- app/post-concern/my-concerns/responses/[responseId].tsx

Behavior:

- replace direct response_feedback upsert with supabase.functions.invoke("save-response-feedback", ...)
- preserve phase-7 screen-state separation
- handle deterministic result codes:
    - saved
    - no_op
    - example_concern_not_allowed

### Step 8. Expo config and registration flow

Config migration:

- replace app.json with app.config.ts
- preserve top-level { expo: { ... } } config shape
- preserve same structure expected by Expo Router/tooling, not just same values

Preserve existing fields exactly:

- expo.name = "Hangyeol"
- expo.slug = "hangyeol"
- expo.scheme = "hangyeol"
- expo.orientation = "portrait"
- expo.userInterfaceStyle = "light"
- expo.plugins retains "expo-router"
- expo.experiments.typedRoutes = true
- expo.android.package = "com.hangyeol.app"
- expo.ios.bundleIdentifier = "com.hangyeol.app"

Add only:

- "expo-notifications" plugin
- extra.eas.projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID

Also update:

- .env.example with EXPO_PUBLIC_EAS_PROJECT_ID

Registration flow:

- root hook in app/_layout.tsx
- separate minimal profile read
- shared readiness helper from src/features/session/gate.ts
- no permission prompt before readiness is true
- permission/token flow starts only after successful minimal profile read

Permission handling:

- undetermined: one prompt per eligible app-process/user lifecycle
- denied: no auto-reprompt; clear current user/platform token row; retry only on next allowed trigger
- granted: fetch token, sync token
- granted but token fetch failed: do not clear token row; retry only on next allowed trigger

Allowed revalidation triggers:

- session/user change
- readiness helper transitions to ready
- foreground to active, subject to cooldown/coalescing

### Step 9. Notifications list tap vs push-open behavior

Shared read helper:

- call public.mark_notification_read(notificationId)
- interpret only the DB-returned boolean:
    - true unread->read
    - false zero rows updated

#### 9.1. Notifications list tap

1. resolve route from DB-loaded row via shared resolver
2. if unsupported:
    - do not mark read
    - do not navigate
3. if supported:
    - call mark_notification_read(...) best-effort
    - ignore false
    - navigate

#### 9.2. Push-open

1. parse exact required payload contract
2. validate all required fields
3. reject malformed/missing/unknown values before route resolution
4. resolve route via shared resolver
5. if unsupported:
    - do not mark read
    - do not navigate
6. if supported:
    - call mark_notification_read(...) best-effort
    - ignore false
    - navigate

Destination screens:

- own access-safe fallback UI for inaccessible targets

### Step 10. Inbox feedback display path

Change:

- src/features/inbox/api.ts
- app/inbox/[deliveryId].tsx

Behavior:

- when response exists, also load get_my_response_feedback_for_delivery(deliveryId)
- show liked/comment state if present

### Step 11. Verification boundaries

#### 11.1. Migration / SQL inspection only

Verify by direct inspection:

- push_tokens uniqueness constraints
- sync_my_push_token(...) SQL shape, search path, grants
- mark_notification_read(...) SQL shape, search path, grants, DB now(), invoker semantics
- wrapper existence and explicit example-concern contracts
- same-transaction notification creation
- push send outside DB transactions

No DB/RPC integration harness is added in this phase.

#### 11.2. Unit tests around client/app code

Test:

- shared readiness helper reuse
- root-layout minimal profile read respects helper
- shared navigation resolver for DB rows and validated push payloads
- client wrapper interpretation of mark_notification_read(...) boolean
- repeated false on already-read rows is safe/idempotent
- feedback-save API semantics:
    - first comment => notify
    - same comment => no notify
    - edited comment => no notify
    - cleared comment => no notify
    - liked + first comment => exactly two notifications
    - liked unchanged + edited comment => no notifications

#### 11.3. Not automated in this phase

Not automated:

- direct DB execution tests for mark_notification_read(...)
- direct wrapper RPC execution tests
- DB-level RLS tests for notification read marking
- guaranteed real Expo push delivery in automation

Covered instead by:

- migration/SQL inspection
- client/app unit tests
- manual verification

## 3. Exact File List to Change

Config and env:

- app.json (replace/remove)
- app.config.ts (new)
- package.json
- package-lock.json
- .env.example

Session gate reuse:

- src/features/session/gate.ts

Database:

- supabase/migrations/20260419010000_phase8_notifications_push.sql

Edge functions:

- supabase/functions/submit-concern/index.ts
- supabase/functions/submit-response/index.ts
- supabase/functions/save-response-feedback/index.ts (new)
- supabase/functions/save-response-feedback/deno.json (new)
- supabase/functions/_shared/expo-push.ts (new)

Client notification / push logic:

- app/_layout.tsx
- app/notifications/index.tsx
- src/features/notifications/api.ts
- src/features/notifications/navigation.ts
- src/features/notifications/types.ts
- src/features/notifications/push-registration.ts (new)

Inbox / feedback client:

- src/features/inbox/api.ts
- app/inbox/[deliveryId].tsx
- src/features/my-concern-responses/api.ts
- app/post-concern/my-concerns/responses/[responseId].tsx

Tests:

- src/features/notifications/navigation.test.ts
- src/features/notifications/push-registration.test.ts (new)
- src/features/notifications/server/push-message.test.ts (new)
- src/features/my-concern-responses/api.test.ts
- any existing edge-function/result-normalization tests that need extension

Progress tracking:

- TODO.md

## 4. Explicit Out-of-Scope List

- any edits under docs/
- unread badges
- logout flows
- install/device identifiers
- multi-install same-platform support
- realtime subscriptions
- background workers / queues / receipt polling
- new navigation structures or tabs
- feedback moderation / blocked-comment UX
- example concern supply flow
- deployment/EAS workflow work beyond the minimal config/env changes needed for token acquisition

## 5. Final Remaining Ambiguities Resolved in This Revision

- foreground-triggered root-layout revalidation is explicitly coalesced with a cooldown to avoid active-state churn
- token fetch/sync failure has an explicit retry policy:
    - no in-process retry loop
    - retry only on next allowed revalidation trigger
- mark_notification_read(...) has explicit SQL body shape, DB-clock source, security model, and idempotence rule
- all four push payload fields are explicitly required, and any missing/malformed field rejects payload before route resolution
- shared route resolver contract is explicit:
    - normalized input
    - pathname/params output
    - null on unsupported combinations
- routing-wrapper exception handling is explicitly logged and failed as an invariant breach
- push verification claims are now proportional to what can actually be proven, including explicit fallback reporting when full device
delivery cannot be verified

## 6. Exact Manual Verification Requirements

Manual verification after implementation must cover at least the following groups.

### 6.1. In-app notification row creation checks

- real concern delivery creates in-app concern_delivered notification
- real concern response creates in-app response_received notification
- first feedback comment creates response_commented exactly once
- later feedback comment edit does not create another notification
- like + first comment together create exactly two notifications once each
- example concern paths do not create notifications

### 6.2. Push-token registration/storage checks

- denied permission clears the current user/platform token row
- granted permission registers exactly one token row for the current user/platform

### 6.3. Push-open / navigation checks

- tapping an in-app notification marks it read and routes correctly
- valid push payload opens the correct route and marks the notification read
- invalid push payload does not mark read and does not navigate

### 6.4. Push delivery smoke checks

If environment/device credentials allow real-device testing, manual verification must also include:

- a real concern delivery triggers an actually received push on a registered device
- a real concern response triggers an actually received push on a registered device
- opening the received push routes correctly and marks the notification read

If full real-device push receipt cannot be completed, verification must explicitly state the highest level actually verified:

- verified end-to-end on device, or
- verified only up to Expo send request construction/submission, or
- verified only payload generation, or
- verified only push-open/navigation simulation

## 7. Exact TODO.md, File-Change, Behavior-Drift, and Manual-Verification Reporting Requirements for the Final Implementation Report

The final implementation report must include:

- exact TODO.md items checked
- exact TODO.md items intentionally left unchecked
- any Phase-8 sub-scope mentioned in this plan that was deferred or not fully implemented
- files changed
- any planned file from the file list that was not changed, stated explicitly with why it was not needed or why it was deferred
- any planned behavior from this plan that was intentionally simplified during implementation, stated explicitly with the reason for that
simplification
- any manual verification item from the plan that could not be completed, stated explicitly with why it could not be completed
- if full real-device push delivery could not be verified, the report must explicitly state what was verified instead:
    - notification row creation only,
    - Expo send request path only,
    - payload generation only,
    - or push-open handling only

The report must not claim planned/partial work as complete. Only items actually implemented in code in this phase may be checked.
