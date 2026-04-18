# Step 3 Plan: Server-Owned Concern Submission + Moderation Audit

  ## Summary

  - Keep the existing private.moderation_audit_entries table, enums, grants, and RLS unchanged. The current audit schema already matches the
    TODO section 5 field contract.
  - Implement Step 3 around one authenticated Supabase Edge Function, submit-concern, that accepts only { body: string }, runs OpenAI
    moderation before any product-table write, and persists blocked vs approved outcomes through a service-only internal DB write path.
  - Do not implement routing, delivery creation, responder selection, fallback delivery behavior, posting UI build-out, or posting UX polish
    in this step.

  ## Key Changes

  - Add one additive SQL migration that creates a service-only transactional helper at the most conservative internal boundary already
    established in the repo.
      - First inspect the existing migrations to confirm whether the repo already uses private for internal functions as well as internal
        tables.
      - Prefer the strongest existing internal boundary already present.
      - If private is already used for internal helper functions, place the helper there.
      - If there is no established internal-function convention, do not introduce a brand new schema structure unless clearly necessary;
        prefer extending the existing internal boundary conservatively.
      - In all cases, the helper must remain non-client-callable, service-only, and must not weaken the existing private schema lockdown.
  - The helper is SECURITY DEFINER, executable only by the server-side role actually required by the final persistence path, and not
    callable by anon or authenticated.
  - Function inputs contain only server-derived persistence data, never client identity fields.
      - Inputs:
          - resolved actor profile id
          - validated/trimmed concern body
          - blocked boolean
          - compact deterministic moderation summary aligned with the audit schema
          - raw provider payload jsonb
      - No client-controlled profile identifier participates in persistence decisions.
  - Transactional behavior:
      - blocked path: insert only into private.moderation_audit_entries, with no public.concerns row and no approved entity link
      - approved path: insert one public.concerns row using the validated/trimmed server-derived body, then insert one linked audit row with
        approved_entity_type = 'concern' and the created concern id
      - approved concern creation and linked audit write happen atomically in one DB transaction

  ## Identity, Authorization, and Product-Table Write Contract

  - Identity source is the authenticated JWT only.
  - The Edge Function must not trust or accept any client-supplied profile id, author id, or equivalent identity field.
  - Request body remains exactly { body: string }.
  - Authorization flow is explicit:
      1. require a valid authenticated user JWT
      2. derive auth user id from the verified request context
      3. resolve the matching public.profiles row server-side
      4. if no matching profile row exists, return a stable failure response and do not attempt moderation or persistence
  - Stable profile-missing failure contract:
      - application-level error code: profile_not_found
      - response shape:
          - { code: "profile_not_found", userMessage: "프로필 상태를 다시 확인해 주세요." }
      - HTTP status should be aligned during implementation with the project’s existing server error semantics for authenticated-but-
        invalid-state failures, rather than hard-coding a new convention prematurely.
  - public.concerns write contract must be aligned to the actual current schema before coding.
      - Inspect the real current public.concerns columns and constraints first.
      - Populate only the minimum required approved-concern fields for Step 3.
      - The implementation must not assume that a body-only insert is sufficient unless the inspected schema confirms that.
      - The inserted concern body is the single validated/trimmed body derived server-side from { body }; there is no second client-trusted
        persistence field.
  - Core storage rule remains fixed:
      - blocked raw text never enters user-facing product tables
      - approved concerns are the only rows created in public.concerns

  ## Edge Function and Moderation Flow

  - Add supabase/functions/submit-concern/index.ts.
      - Require a valid authenticated user JWT.
      - Validate request body server-side:
          - body must be a string
          - trim() must be non-empty
          - max length remains 2000
      - Run OpenAI moderation before any public.concerns insert.
      - Call the internal transactional helper for blocked or approved persistence.
  - Add a small moderation utility under supabase/functions/_shared/.
      - Call OpenAI Moderation API with model = "omni-moderation-latest"
      - Normalize into a stable internal shape:
          - blocked: boolean
          - deterministic moderation-category summary
          - rawProviderPayload
      - Persist a compact, deterministic moderation summary suitable for category_summary, aligned with the existing audit storage contract
        rather than overcommitting to a new JSON shape prematurely.

  ## Environment / Secrets Boundary

  - Keep client-exposed env and server-only secrets clearly separated.
  - Client env remains limited to Expo-safe values such as:
      - EXPO_PUBLIC_SUPABASE_URL
      - EXPO_PUBLIC_SUPABASE_ANON_KEY
  - Server-only secrets are for Edge Functions / local Supabase function runtime only, not Expo client config.
      - OPENAI_API_KEY
      - SUPABASE_SERVICE_ROLE_KEY only if the chosen persistence path truly requires a service-role client after implementation review
  - Reconfirm during implementation whether SUPABASE_SERVICE_ROLE_KEY is actually required for the final server-side persistence path.
      - If the final implementation truly needs a service-role client for the internal write path, keep it strictly server-only.
      - If the same security boundary can be preserved without introducing that extra dependency, prefer the simpler option.
  - If env documentation is updated:
      - either clearly separate client-exposed vs server-only sections
      - or keep server secrets out of the generic Expo-facing example file and document them in the Supabase function setup path
  - OPENAI_API_KEY and any service-role credential must never use EXPO_PUBLIC_*

  ## Shared Types / Minimal Client Boundary

  - Add shared API contract types only where they improve boundary clarity.
  - A client helper in this step is optional and must stay strictly minimal.
      - It may provide only a thin typed call to supabase.functions.invoke("submit-concern", ...).
      - It must not expand into screen wiring, form flow, retry handling, optimistic state, blocked-warning UX behavior, or other posting-
        step responsibilities.
  - Response union:
      - approved: { status: "approved", concernId: string }
      - blocked: { status: "blocked", code: "moderation_blocked", userMessage: "부적절한 표현이 감지되었습니다." }
      - profile-missing error: { code: "profile_not_found", userMessage: "프로필 상태를 다시 확인해 주세요." }
  - The primary deliverable of Step 3 is the server-owned submission path, not app-side usage polish.

  ## Error Handling and MVP Tradeoffs

  - Validation failures:
      - reject non-string, empty-after-trim, or over-limit bodies before moderation
      - no concern row is created
  - Auth failures:
      - 401 for missing/invalid JWT
  - Profile-missing failure:
      - stable application error code profile_not_found
      - no moderation call
      - no persistence
  - Moderation/provider failures:
      - fail closed
      - no concern row is created
      - no audit row is written in this step
  - This provider/runtime-failure behavior is a deliberate short-term MVP tradeoff, not a neutral default.
      - Benefit: keeps audit semantics narrowly scoped to completed moderation decisions on submitted content.
      - Cost: reduces operational traceability for failed submissions caused by provider/runtime issues.
      - Deferred follow-up: add a separate observability/error-logging path later if operational debugging needs that visibility, without
        broadening moderation audit semantics prematurely.

  ## Test Plan

  - Add focused tests only for the newly introduced server-side logic boundaries in this step.
  - Pure logic tests:
      - concern submission validation rejects missing/non-string body, whitespace-only body, and over-limit body
      - valid input returns trimmed body
      - moderation normalization yields deterministic blocked/unblocked interpretation and deterministic summary output
  - Orchestration-layer tests:
      - auth/profile resolution success proceeds to moderation
      - profile resolution failure returns the stable profile_not_found contract and does not reach moderation or persistence
      - blocked moderation result routes to audit-only persistence
      - approved moderation result routes to concern creation plus linked audit persistence
      - blocked flow never reaches product-row creation logic
  - Keep tests lightweight.
      - Avoid heavy Edge Function runtime scaffolding, broad DB-mocking layers, or reusable integration-test infrastructure unless
        absolutely necessary for the Step 3 code being added.
      - The goal is confidence in validation, moderation normalization, auth/profile branching, and blocked-vs-approved persistence routing,
        not test-framework expansion.

  ## TODO.md Handling

  - Check only the Step 3 items actually completed by the code in this turn.
  - Likely eligible after implementation:
      - section 8 고민 제출 서버 API를 구현한다.
      - its sub-items:
          - raw 입력 수신
          - moderation 실행
          - 차단 시 audit만 남기고 제품 row 생성 금지
          - 승인 시 concerns row 생성
  - Leave intentionally unchecked:
      - section 5 combined items that still cover 고민/답변/후기 코멘트 together
      - blocked warning UX/modal behavior
      - routing eligibility / delivery count / OpenAI responder selection
      - inbox or posting UI implementation
      - broad moderation test items that exceed concern-submission scope

  ## Assumptions

  - The server-side max concern length remains 2000 characters for this step.
  - The blocked API response remains generic and does not expose moderation categories to the client in this step.
  - Final helper placement follows the most conservative existing internal boundary discovered during migration review.