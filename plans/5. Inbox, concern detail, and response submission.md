 # Step 5: Inbox, Concern Detail, and Response Submission

  ## Summary

  - Replace the temporary inbox handoff with a real inbox stack:
      - app/inbox/_layout.tsx
      - app/inbox/index.tsx
      - app/inbox/[deliveryId].tsx
  - Add:
      - src/features/inbox/api.ts
      - src/features/inbox/types.ts
      - src/features/inbox/mappers.ts
      - src/features/responses/contracts.ts
      - src/features/responses/validation.ts
      - src/features/responses/api.ts
      - src/features/responses/server/submit-response-service.ts
      - src/features/responses/server/submit-response-service.test.ts
      - src/features/responses/validation.test.ts
      - supabase/functions/submit-response/index.ts
      - one additive SQL migration
  - Scope stays limited to TODO.md section 9.
  - Notification scope in this step is only durable public.notifications row creation for real concerns.
  - No push dispatch implementation is added in this step.

  ## Exact DB Changes

  ### 1. New policy: recipient concern read

  - Object type:
      - one new SELECT policy on public.concerns
  - Existing policy handling:
      - keep the current author-read policy unchanged
      - add one separate recipient-read policy
  - Exact purpose:
      - allow a recipient to read the concern body for concerns that were assigned to that recipient
  - Why existing RLS is insufficient:
      - inbox/detail screens use the authenticated app client
      - current public.concerns access is not sufficient for recipient-side inbox/detail rendering
  - Why this is the minimal safe change:
      - additive only
      - delivery-scoped only
      - does not replace or merge the existing author-read policy
      - avoids building extra server read endpoints solely to proxy a narrow read already expressible in RLS
  - Intended lifetime of recipient read access:
      - recipient concern read access remains valid for any concern ever assigned to that recipient, including after the delivery reaches
        responded
  - Rationale:
      - this is an intentional product rule, not just a step 5 convenience
      - a recipient who was legitimately assigned a concern may continue to read that concern through the full assigned -> opened ->
        responded lifecycle
      - access still remains narrowly scoped to historically assigned concerns only, not general concern browsing

  New policy rule:

  - authenticated user may select a concern row when there exists a public.concern_deliveries row such that:
      - concern_deliveries.concern_id = concerns.id
      - concern_deliveries.recipient_profile_id = auth.uid()

  ### 2. New function: mark delivery opened

  - Object type:
      - new function public.mark_concern_delivery_opened(p_delivery_id uuid) returns boolean
      - revoke/grant execute statements
  - Exact purpose:
      - perform the assigned -> opened transition in a server-owned path
  - Why existing schema/RLS is insufficient:
      - authenticated users have no direct update path on public.concern_deliveries
  - Why this is the minimal safe change:
      - one small authenticated RPC is smaller and clearer than a dedicated Edge Function for a single owned transition
  - Final contract:
      - returns true when the function changed the row from assigned to opened
      - returns false when no transition occurred
  - Why this is the simplest final contract:
      - caller still uses server-refetch as the source of truth
      - tests and logs get explicit observable behavior
      - no ambiguous void semantics

  Function behavior:

  - update only the row where:
      - id = p_delivery_id
      - recipient_profile_id = auth.uid()
      - status = 'assigned'
  - set:
      - status = 'opened'
      - opened_at = now()
  - return false when:
      - no owned row exists
      - row is already opened
      - row is already responded

  Security:

  - revoke from public and anon
  - grant execute to authenticated

  ### 3. New function: atomic response persistence

  - Object type:
      - new function public.submit_response_with_moderation_audit(...)
      - revoke/grant execute statements
  - Exact purpose:
      - atomically persist blocked-vs-approved response outcomes
  - Why existing schema/RLS is insufficient:
      - blocked path must write private.moderation_audit_entries
      - approved path must atomically combine:
          - public.responses insert
          - public.concern_deliveries status/timestamp update
          - private.moderation_audit_entries approved-link insert
          - public.notifications insert for real concerns
  - Why this RPC is justified:
      - it is the minimal way to preserve one transaction across all required approved-path writes
      - doing these as separate service-role statements in the Edge Function would not be atomic
      - the repo already uses this service-role RPC pattern for concern submission for the same reason
  - Why public schema placement is used:
      - callable RPC surface is through public
      - audit tables/functions remain protected in private
      - execution remains limited to service_role only
  - Exposure limit:
      - revoke from public, anon, and authenticated
      - grant execute only to service_role

  Inputs:

  - p_actor_profile_id uuid
  - p_delivery_id uuid
  - p_raw_submitted_text text
  - p_validated_body text
  - p_blocked boolean
  - p_category_summary jsonb default '{}'::jsonb
  - p_raw_provider_payload jsonb default '{}'::jsonb

  Return shape:

  - one row with:
      - response_id uuid
      - result_code text
      - notification_created boolean

  Result codes:

  - blocked
  - approved
  - delivery_not_accessible
  - delivery_already_responded

  Security semantics for inaccessible vs missing delivery:

  - missing delivery and another user’s delivery are intentionally unified as delivery_not_accessible
  - this unification is both internal and external
  - rationale:
      - callers must not be able to distinguish “does not exist” from “exists but is someone else’s”
      - this avoids delivery enumeration and keeps DB/Edge Function behavior aligned

  Function behavior:

  1. Load the target delivery joined to concern by p_delivery_id.
  2. If no row exists owned by p_actor_profile_id, return:
      - response_id = null
      - result_code = 'delivery_not_accessible'
      - notification_created = false
  3. If the owned delivery is already responded, return:
      - response_id = null
      - result_code = 'delivery_already_responded'
      - notification_created = false
  4. If p_blocked = true:
      - insert only one moderation audit row with subject_type = 'response'
      - do not insert public.responses
      - do not update delivery
      - do not insert notification
      - return blocked result
  5. If approved:
      - insert one public.responses row for p_delivery_id
      - update the owned public.concern_deliveries row to:
          - status = 'responded'
          - opened_at = coalesce(opened_at, now())
          - responded_at = now()
      - insert linked moderation audit row with approved response linkage
      - if the underlying concern is real, insert one notification row
      - if the underlying concern is example, insert no notification
      - return approved result

  Notification row contract:

  - before coding, verify the exact allowed enum values from the existing repository schema/migration/type definitions
  - implementation must use those exact existing values for:
      - the notification type representing “response received”
      - the related entity type representing a response row
  - no near-match strings or newly invented values are allowed

  Duplicate prevention and race handling:

  - one response per delivery is already guaranteed by the existing UNIQUE (delivery_id) constraint on public.responses
  - the function also performs an explicit pre-check for status = 'responded'
  - if a race still reaches the unique constraint:
      - the function catches it and returns delivery_already_responded
  - final observable API behavior in that race:
      - caller receives the same clean delivery_already_responded result as any other already-responded case
      - no duplicate public.responses row survives
      - no duplicate notification row survives from the losing transaction

  No new indexes or constraints are added in this migration.

  ## Screen and Query Structure

  ### Inbox screen

  Files:

  - app/inbox/_layout.tsx
  - app/inbox/index.tsx
  - src/features/inbox/api.ts
  - src/features/inbox/mappers.ts
  - src/features/inbox/types.ts

  Inbox query:

  - query public.concern_deliveries with the authenticated client
  - select:
      - id
      - status
      - delivered_at
      - opened_at
      - responded_at
      - routing_order
      - joined concern fields needed for the list:
          - concerns(id, source_type, body, created_at)
  - filter:
      - owned rows only through RLS
      - status in ('assigned','opened')

  Deterministic ordering in app code:

  1. assigned deliveries first
  2. opened deliveries second
  3. within the same status, newer delivered_at first
  4. then lower routing_order first
  5. then lower id lexicographically first

  UI states:

  - loading
  - empty
  - retryable error
  - populated list

  ### Concern detail screen

  Files:

  - app/inbox/[deliveryId].tsx
  - src/features/inbox/api.ts

  Detail data is loaded with two explicit ownership-safe queries.

  Query 1: owned delivery + concern

  - query public.concern_deliveries
  - select:
      - id
      - concern_id
      - status
      - delivered_at
      - opened_at
      - responded_at
      - routing_order
      - joined concern fields:
          - concerns(id, source_type, body, created_at)
  - filter:
      - .eq("id", deliveryId).maybeSingle()
  - ownership safety:
      - enforced by concern_deliveries RLS

  Query 2: existing response for this owned delivery

  - only run after Query 1 succeeds
  - query public.responses
  - select:
      - id
      - delivery_id
      - body
      - created_at
  - filter:
      - .eq("delivery_id", deliveryId).maybeSingle()
  - ownership safety:
      - enforced by existing responses RLS for the recipient participant

  Invariant:

  - one delivery can have at most one visible submitted response
  - guaranteed by existing UNIQUE (delivery_id) on public.responses

  If Query 1 returns no row:

  - show explicit not-found/not-accessible state
  - do not call mark-open
  - do not run response query

  ## Detail Screen State Machine

  Final synchronization model:

  1. load Query 1
  2. if owned delivery exists and status === 'assigned', call mark_concern_delivery_opened(deliveryId)
  3. after that call resolves, refetch Query 1
  4. after Query 1 settles, run Query 2 for the response row
  5. derive UI from the latest server state only

  Why this is final:

  - simplest and least ambiguous
  - server remains source of truth for:
      - status
      - opened_at
      - responded_at
      - response existence

  UI precedence rules:

  - if the latest response query returns a response row, render the read-only submitted state
  - this takes precedence over any compose state
  - if no response row exists and latest delivery status is assigned or opened, render the editable compose state
  - if latest delivery status is responded but response query is still pending, keep loading/synchronizing state until response query
    finishes
  - once the latest server-backed response row exists, the screen must never show an editable compose form

  No optimistic local patching is planned.

  ## Response Form and API Contract

  ### Client form

  Files:

  - app/inbox/[deliveryId].tsx
  - src/features/responses/validation.ts
  - src/features/responses/api.ts
  - src/features/responses/contracts.ts

  Form rules:

  - one multiline body input
  - minimum trimmed length: 5
  - maximum length: 2000
  - submit disabled when:
      - invalid
      - in flight
      - latest delivery state is already responded
      - latest response query already returned a response row

  Blocked UX:

  - show exact text: 부적절한 표현이 감지되었습니다.
  - keep draft text unchanged
  - allow edit and resubmit

  ### Edge Function

  File:

  - supabase/functions/submit-response/index.ts

  Request:

  - POST
  - body:
      - { "deliveryId": string, "body": string }

  Success responses:

  - approved:
      - { "status": "approved", "responseId": string }
  - blocked:
      - { "status": "blocked", "code": "moderation_blocked", "userMessage": "부적절한 표현이 감지되었습니다." }

  Error responses:

  - auth_required
  - invalid_json
  - invalid_delivery_id
  - invalid_body_type
  - empty_body
  - body_too_short
  - body_too_long
  - profile_not_found
  - delivery_not_accessible
  - delivery_already_responded
  - moderation_unavailable
  - response_submission_failed

  HTTP/application error mapping:

  - delivery_not_accessible maps to HTTP 404
  - justification:
      - the contract intentionally treats missing and unauthorized deliveries as the same not-found-style failure
      - this best matches the non-enumeration goal
  - delivery_already_responded maps to HTTP 409
  - justification:
      - the owned target exists but no longer accepts a new response

  Edge Function mapping from RPC result:

  - blocked -> blocked success response
  - approved -> approved success response
  - delivery_not_accessible -> 404 application error with generic target-check message
  - delivery_already_responded -> 409 application error with already-responded message

  ## Transaction Boundaries

  Approved real concern path must be atomic across:

  - public.responses insert
  - public.concern_deliveries update to responded
  - linked private.moderation_audit_entries insert
  - public.notifications insert

  Approved example concern path must be atomic across:

  - public.responses insert
  - public.concern_deliveries update to responded
  - linked private.moderation_audit_entries insert

  Blocked path must be atomic across:

  - blocked private.moderation_audit_entries insert only

  No additional side effects are included in step 5.

  ## Tests

  ### Delivery-open tests

  - mark_concern_delivery_opened changes an owned assigned delivery to opened and returns true
  - mark_concern_delivery_opened is idempotent for already opened and returns false
  - mark_concern_delivery_opened is idempotent for already responded and returns false
  - mark_concern_delivery_opened does not modify another user’s delivery and returns false

  ### Response submission service tests

  - missing delivery returns delivery_not_accessible
  - another user’s delivery returns delivery_not_accessible
  - already responded delivery returns delivery_already_responded
  - blocked submission does not create public.responses
  - approved submission creates one response and updates delivery to responded
  - approved real concern path creates one notification row using exact existing schema enum values
  - approved example concern path creates no notification row
  - duplicate/race path resolves to delivery_already_responded
  - no duplicate response row survives
  - no duplicate notification row survives

  ### Detail/loading tests

  - owned delivery detail loads with separate delivery query and response-by-delivery query
  - no response row returns compose state
  - existing response row returns read-only submitted state
  - if the latest response query returns a response row after mark-open/refetch, UI prefers read-only submitted state

  ### Validation tests

  - invalid UUID delivery id rejected
  - whitespace-only body rejected
  - under-5-char body rejected
  - over-2000-char body rejected
  - valid trimmed body accepted

  ## TODO.md Handling

  - Update TODO.md only after code is implemented and only according to docs/RULE.md.
  - Check only section 9 items that are fully true in code in this turn.
  - Do not check planned, deferred, or partially implemented items.
  - Keep TODO.md as an accurate progress record.

  Eligible to check only if fully implemented:

  - Inbox에서 concern_deliveries 기반 목록 조회를 구현한다.
  - 고민 상세 화면을 구현한다.
  - 답변 작성 폼을 구현한다.
  - 답변 제출 API를 구현한다.
      - moderation 실행
      - 차단 시 audit만 남기고 제품 row 생성 금지
      - 승인 시 responses 생성
      - 대응 concern_deliveries.status를 responded로 변경
  - 부적절한 답변 차단 UX를 문서 기준으로 맞춘다.
      - 경고 문구 표시
      - 기존 작성 내용 유지
      - 수정 후 재전송 가능
  - 실사용자 고민에 대한 답변 완료 시 게시자에게 알림을 생성한다.
  - 예제 고민에 대한 답변 완료 시 알림을 생성하지 않는다.

  Must remain unchecked in this step:

  - both push-related bullets in section 9
  - any step 7, 10, 11, 12, or 13 work outside this scope
