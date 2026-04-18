# Phase 6 Final Tightened Plan: My Concerns and Response Viewing

## Summary

- Implement only TODO.md section 10:
    - Post concern internal My concerns list
    - my real concern detail
    - response list/detail viewing for my concern
    - notification entries opening the corresponding detail for the notification type the current codebase actually produces
- Preserve scope discipline:
    - no 4-tab shell
    - no inbox migration
    - no docs edits
    - no push work
    - no feedback expansion
    - no unrelated cleanup
- Update TODO.md only for section 10 items that are fully implemented in code.

## Reachability Strategy

To make section 10 reachable from the current app with the smallest prerequisite:

- Keep existing /inbox routes unchanged.
- Add two new top-level route trees:
    - /post-concern
    - /notifications
- Add two entry buttons on the existing reachable app/inbox/index.tsx screen:
    - Post concern
    - Notifications

These are minimal reachability controls only. They exist solely to make the new Phase-6 routes reachable from the current app entry path.
No broader visual redesign, layout expansion, inbox-home UX change, IA restructuring, or content reorganization is included in this phase.

### Why /notifications is still the smallest correct prerequisite

The section-10 notification TODO is not satisfied by route support alone; it requires actual notification entries to open the
corresponding authored concern/response detail.

In the current repository state:

- users land in /inbox
- there is no existing notification screen or reachable notification entry surface
- the codebase already generates real notification rows for response receipt in Step 5
- without a screen that reads and renders those rows, there is no actual user path to exercise “notification entry -> detail” behavior

Why narrower options are insufficient:

- Adding only destination routes is insufficient because no notification entry exists in UI to trigger them
- Adding only helper code or route parsing is insufficient because the TODO is about notification entries, not just URLs
- Adding a hidden/debug-only path would not satisfy the product-facing flow required by section 10

Why this does not broaden notifications beyond Phase 6:

- the screen is minimal and read-only
- it exists only to render current user notification rows and open supported targets
- it will not add read-state mutation, unread filters, push integration, or new notification-generation behavior

## Final Route Shape

Chosen response-detail route:

- /post-concern/my-concerns/responses/[responseId]

Why this flatter route is the final choice for Phase 6:

- current notification rows already provide related_entity_id = response_id
- a nested response route under [concernId] would require an extra lookup before navigation from notifications
- the flat route allows direct notification-entry navigation with no extra resolver RPC
- the response-detail RPC can return concern_id, which is enough to restore parent navigation in the screen UX

### Response-detail UX contract

The response-detail screen must always provide one explicit parent navigation action:

- 해당 고민으로 돌아가기

Behavior:

- after loading get_my_concern_response_detail(p_response_id), use the returned concern_id
- pressing that action navigates to:
    - /post-concern/my-concerns/[concernId]
- if the response detail cannot be loaded, show the safe inaccessible/not-found state and do not render the parent action

This is the consistent authored-flow rule for the flat route:

- route in by responseId
- render detail only if author-authorized
- navigate back to parent concern via returned concern_id

## Implementation Chunks Mapped to TODO Items

### 1. Post concern internal My concerns list

Maps to:

- TODO.md section 10 -> Post concern` 내부에 `My concerns` 목록을 구현한다.

Implementation:

- Add app/post-concern/_layout.tsx
- Add app/post-concern/index.tsx
    - minimal entry screen with one action to open My concerns
    - no concern submission UI in this phase
- Add app/post-concern/my-concerns/index.tsx
- Add a small feature module for authored concern reads:
    - src/features/my-concerns/api.ts
    - src/features/my-concerns/types.ts
    - src/features/my-concerns/mappers.ts

Data path:

- direct authenticated select on public.concerns
- filter:
    - source_type = 'real'
- rely on existing RLS:
    - concerns_select_own_real
- order:
    - created_at desc
    - tie-breaker id desc

List item fields:

- id
- body preview
- createdAt

Why no SQL/RPC is added here:

- existing RLS already restricts reads to real concerns authored by auth.uid()
- the list needs only authored concern rows
- direct select is already the smallest correct implementation

UI states:

- loading
- empty
- retryable error
- populated list

### 2. My authored concern detail

Maps to:

- TODO.md section 10 -> 내가 작성한 실제 고민의 상세 화면을 구현한다.

Implementation:

- Add app/post-concern/my-concerns/[concernId].tsx

Data path:

- direct authenticated select on public.concerns
- fetch by id = concernId
- rely on existing RLS:
    - only real concerns authored by auth.uid() are visible

Shown data:

- full concern body
- createdAt
- response list section below the concern

Access behavior:

- missing concern and unauthorized concern render the same safe inaccessible/not-found state
- no existence leakage

Why no SQL/RPC is added for the concern itself:

- existing concerns_select_own_real already matches the exact ownership boundary required here
- the concern detail itself does not require delivery-level access
- direct select is the smallest safe solution

### 3. Response list for my concern

Maps to:

- TODO.md section 10 -> 내 고민에 달린 답변 목록/상세 화면을 구현한다.

Implementation:

- the authored concern detail screen includes the response list
- add a feature module for authored-concern response viewing:
    - src/features/my-concern-responses/api.ts
    - src/features/my-concern-responses/types.ts
    - src/features/my-concern-responses/mappers.ts

SQL addition:

- add one authenticated RPC:
    - public.list_my_concern_responses(p_concern_id uuid)

Exact return shape:

- response_id uuid
- body text
- created_at timestamptz

Why existing RLS + direct select is insufficient:

- the concern author may read responses, but cannot read concern_deliveries
- to assemble the responses for one authored concern with direct client queries, the client would need concern -> delivery -> response
resolution
- widening author access to concern_deliveries would expose recipient-linked rows and is broader than Phase 6 requires

Exact authorization rule enforced by this RPC:

- return rows only when there exists a concern c such that:
    - c.id = p_concern_id
    - c.source_type = 'real'
    - c.author_profile_id = auth.uid()
- returned rows must be only responses r joined through deliveries d where:
    - d.concern_id = c.id
    - r.delivery_id = d.id
- otherwise return zero rows

What security problem this prevents:

- prevents giving the concern author direct read access to concern_deliveries
- prevents exposing delivery/recipient linkage just to show authored responses
- keeps the author-side read surface limited to the exact fields needed for this phase

### 4. Response detail for my concern

Maps to:

- TODO.md section 10 -> 내 고민에 달린 답변 목록/상세 화면을 구현한다.

Implementation:

- add app/post-concern/my-concerns/responses/[responseId].tsx

SQL addition:

- add one authenticated RPC:
    - public.get_my_concern_response_detail(p_response_id uuid)

Exact return shape:

- response_id uuid
- concern_id uuid
- body text
- created_at timestamptz

Why this is the final and only response-detail RPC design:

- it matches the chosen flat route keyed by responseId
- it matches the current notification data shape, which already provides response_id
- it lets the response-detail screen load both the response content and parent concern_id
- it avoids both:
    - an extra concern lookup before notification navigation
    - a separate notification resolver RPC

Why existing RLS + direct select is insufficient:

- direct select on public.responses by response_id is too broad for this authored-flow screen because existing
responses_select_participant allows access to both:
    - the concern author
    - the response recipient
- this screen must be author-centric: the response must belong to a real concern authored by auth.uid(), not merely to any participant-
related row

Exact authorization rule enforced by this RPC:

- return a row only when there exists:
    - a concern c such that:
        - c.source_type = 'real'
        - c.author_profile_id = auth.uid()
    - a delivery d such that:
        - d.concern_id = c.id
    - a response r such that:
        - r.id = p_response_id
        - r.delivery_id = d.id
- otherwise return no row

What security problem this prevents:

- prevents a response recipient from using the authored-flow response detail just because they are a participant under the broader base
RLS
- prevents reading a response attached to another user’s concern by guessing responseId
- prevents existence leakage across other users’ response records

Committed behavior:

- the response-detail screen always fetches through get_my_concern_response_detail(p_response_id)
- no alternate direct-select response-detail path will be used

## Notification Scope: Final Phase-6 Commitment

Maps to:

- TODO.md section 10 -> 알림에서 해당 고민/답변 상세로 진입할 수 있게 한다.

Chosen scope:

- implement the minimal real notification-entry path for the notification target type the current codebase actually produces
- in the current repository, the implemented notification creation path is in Step 5 response submission, which creates:
    - type = 'response_received'
    - related_entity_type = 'response'
    - related_entity_id = response_id
- Phase 6 will make those real notification entries open the authored response-detail screen
- concern-target notifications are not implemented in this phase because there is no current code path generating them

Why this is the correct repository-aware scope:

- grounded in current code behavior, not only schema possibility
- the repo currently generates response-target notifications, not concern-target notifications
- implementing navigation for actual generated entries is the smallest correct Phase-6 completion path

This TODO item is intended to be fully completed in this phase by:

- adding a real notifications list screen
- making actual response_received entries open the authored response-detail screen

Completion condition for this TODO item:

- it is complete only when real notification rows generated by the current application code path open the authored response-detail screen
correctly
- seeded, mocked, or debug-only placeholder rows are not sufficient for claiming completion

## Exact Responsibility Split

### Notifications screen responsibility

Route:

- app/notifications/index.tsx

Responsibilities:

- load notification rows with direct authenticated select on public.notifications
- render notification entries
- for supported entries, convert the notification row into a route target

Supported target handling in this phase:

- related_entity_type = 'response'
    - route target is /post-concern/my-concerns/responses/[responseId]
    - responseId = related_entity_id

Not responsible for:

- authorizing response-detail access
- fetching response-detail content
- validating whether the response belongs to a real concern authored by the current user

### Response-detail route responsibility

Route:

- app/post-concern/my-concerns/responses/[responseId].tsx

Responsibilities:

- read responseId from the route
- call get_my_concern_response_detail(p_response_id)
- render detail when an authorized row is returned
- render the same safe inaccessible/not-found state when no row is returned
- expose the explicit parent navigation action using returned concern_id

Not responsible for:

- interpreting notification row types
- deciding which notification rows are navigable

### SQL RPC responsibility

- list_my_concern_responses(p_concern_id)
    - authorize and return only the responses attached to a real concern authored by auth.uid()
- get_my_concern_response_detail(p_response_id)
    - authorize and return detail for exactly one response only when that response belongs to a real concern authored by auth.uid()
    - return the parent concern_id needed for consistent authored-flow navigation

This split is intentional:

- notifications screen turns notification rows into route targets
- response-detail route loads and renders detail
- SQL enforces the author-only ownership boundary
- no duplicated authorization logic

## Notifications Implementation

Add:

- app/notifications/index.tsx
- src/features/notifications/api.ts
- src/features/notifications/types.ts
- src/features/notifications/mappers.ts
- src/features/notifications/navigation.ts

Data path:

- direct authenticated select on public.notifications
- rely on existing RLS:
    - notifications_select_own
- order:
    - created_at desc
    - tie-breaker id desc

What this screen includes:

- loading state
- empty state
- retryable error state
- list of actual notification entries
- press handling for response targets

What it does not include:

- read-state mutation
- unread filtering
- push registration or delivery
- concern-target support not generated by current code
- broader notification feature expansion

## SQL Surface Area: Final Commitment

Exactly two authenticated RPCs will be added in one additive migration:

1. public.list_my_concern_responses(p_concern_id uuid)

- concern-scoped response list
- returns rows only when p_concern_id identifies a real concern authored by auth.uid()

2. public.get_my_concern_response_detail(p_response_id uuid)

- authored response detail
- returns a row only when p_response_id identifies a response attached through concern_deliveries to a real concern authored by auth.uid()

Security shape for both:

- security definer
- revoke from public and anon
- grant execute to authenticated
- unauthorized, nonexistent, or stale targets return empty set / no row

No additional notification resolver RPC will be added.
No change will be made to concern_deliveries RLS.
No change will be made to base responses RLS.
No schema expansion beyond these two RPCs will be added.

## Concrete Route Set After Phase 6

New routes:

- /post-concern
- /post-concern/my-concerns
- /post-concern/my-concerns/[concernId]
- /post-concern/my-concerns/responses/[responseId]
- /notifications

Existing routes preserved unchanged:

- /
- /onboarding
- /inbox
- /inbox/[deliveryId]

## Verification Plan

### Automated coverage

Automated tests remain limited to pure logic because the current repo does not include an established app-layer Supabase integration
harness.

Add unit tests for:

- notification navigation helper:
    - response notification -> response detail route
    - unsupported target -> non-navigable result
- any pure mapper used for authored concern list / response list formatting

Automated tests will not be claimed to verify DB authorization behavior.

### Required manual verification for SQL RPC boundaries

These checks must be performed against local Supabase or an equivalent dev database with at least:

- user A who authored a real concern with at least one response
- user B who is the recipient/response author for that concern
- user C who is unrelated to that concern

#### RPC 1: list_my_concern_responses(p_concern_id)

Authorized case:

- authenticate as user A
- call the app flow to open /post-concern/my-concerns/[concernId] for A’s real concern
- verify the response list renders rows returned by the RPC
- verify the listed responses correspond only to deliveries for that concern

Unauthorized concernId case:

- authenticate as user C
- manually open /post-concern/my-concerns/[concernId-of-A]
- verify the concern detail itself fails safely
- verify no response rows are shown
- if directly invoking the RPC in dev verification, confirm it returns zero rows for C with A’s concern id

Stale/nonexistent concernId case:

- authenticate as user A
- open a nonexistent concern id route
- verify safe inaccessible/not-found state
- if directly invoking the RPC in dev verification, confirm zero rows are returned

#### RPC 2: get_my_concern_response_detail(p_response_id)

Authorized case:

- authenticate as user A
- open a response detail for a response attached to A’s real concern
- verify the detail screen renders body and parent-navigation action
- verify returned concern_id links back to A’s concern detail

Unauthorized/stale responseId case:

- authenticate as user C
- manually open /post-concern/my-concerns/responses/[responseId-of-A-concern]
- verify safe inaccessible/not-found state
- if directly invoking the RPC in dev verification, confirm no row is returned

Recipient-only access is not enough:

- authenticate as user B, who authored the response but did not author the concern
- manually open /post-concern/my-concerns/responses/[responseId]
- verify safe inaccessible/not-found state
- if directly invoking the RPC in dev verification, confirm no row is returned even though B is the recipient/response author

Stale/nonexistent responseId case:

- authenticate as user A
- open a nonexistent response id route
- verify safe inaccessible/not-found state
- if directly invoking the RPC in dev verification, confirm no row is returned

### Required manual verification of UI behavior

1. Authored concern list visibility

- signed-in user can open /post-concern/my-concerns
- list shows only real concerns authored by that user
- example concerns do not appear
- another user’s concerns do not appear

2. Authored concern detail access

- opening my concern shows the detail screen
- manually entering another user’s concernId route shows the safe inaccessible/not-found state

3. Response list and detail flow

- tapping a response from my concern detail opens /post-concern/my-concerns/responses/[responseId]
- response-detail screen shows the explicit 해당 고민으로 돌아가기 action
- that action returns to /post-concern/my-concerns/[concernId]

4. Notification entry behavior

- /notifications shows the current user’s notification entries
- a real response_received notification opens /post-concern/my-concerns/responses/[responseId]
- stale or unauthorized responseId targets fail safely without revealing existence

### Required regression verification for current flows

These existing flows must continue to work after Phase 6 additions:

1. App bootstrap and onboarding routing

- onboarded user still lands in /inbox
- not-yet-onboarded user still lands in /onboarding

2. Inbox list

- /inbox still loads current assigned/opened deliveries
- current empty/error states still behave as before

3. Inbox detail

- /inbox/[deliveryId] still loads recipient-side concern detail
- assigned delivery still transitions to opened through the existing RPC
- inaccessible delivery still shows the current safe failure state

4. Response submission from inbox

- recipient can still submit a response
- blocked response flow still preserves draft and blocked message
- approved response submission still updates the inbox detail correctly

## Final Reporting Requirement

The final implementation report must clearly separate:

- what was actually verified
- what was not verified
- which TODO.md items were intentionally left unchecked because implementation or verification did not fully complete

This is required to prevent over-reporting completion when any planned verification could not be performed.

## TODO Discipline

### TODO items intended to be checked after this phase, if fully implemented in code

From TODO.md section 10 only:

- Post concern 내부에 My concerns 목록을 구현한다.
- 내가 작성한 실제 고민의 상세 화면을 구현한다.
- 내 고민에 달린 답변 목록/상세 화면을 구현한다.
- 알림에서 해당 고민/답변 상세로 진입할 수 있게 한다.
    - this will be considered complete only when real response_received rows generated by the current application code path open the
    authored response-detail screen correctly

### TODO items intentionally left unchecked after this phase

- All section 7 app-shell/tab items
- All section 8 concern-posting UI items
- All section 9 push-related items
- Concern-target notification support not generated by current code
- Any feedback-related expansion outside already completed work
