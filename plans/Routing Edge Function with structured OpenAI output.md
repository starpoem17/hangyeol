 # Phase 4 Routing With Structured OpenAI Output

  ## Summary

  Implement Phase 4 as a minimal backend-only extension of the existing approved concern flow.

  Chosen boundaries for this phase:

  - submit-concern remains the only app-visible API involved.
  - submit-concern’s public response contract stays unchanged.
  - Routing runs directly in-process from submit-concern after approved concern persistence.
  - Do not add a separate route-concern Edge Function in Phase 4.
  - Do not create notification rows in Phase 4.
  - Do not add any notification-related TODO notes or explanatory comments.

  Reason:

  - The repository’s current step is routing-critical backend work, not ops/retry surface expansion or notifications phase work.
  - Adding an extra internal Edge Function now would create new callable surface area without a real retry/ops workflow implemented yet.
  - Creating notification rows now while leaving related TODO items unchecked is easy to misread and violates the “no ambiguity in the
    current step” bar.
  - Deferring both the extra routing endpoint and notification writes keeps Phase 4 minimal and review-stable.

  ## Invocation Boundary

  ### Primary path

  Use direct internal module invocation from the existing submit-concern Edge Function into shared routing service code.

  Exact sequence:

  1. client calls submit-concern
  2. moderation runs
  3. approved concern row is created
  4. submit-concern directly calls shared routing service with the new concernId
  5. routing either:
      - creates ordered concern_deliveries, or
      - returns no_delivery, or
      - fails without creating deliveries

  ### Why no separate Edge Function now

  A dedicated internal route-concern Edge Function is not required in Phase 4 because:

  - the repository already has one trusted server path for posting concerns
  - routing is immediately downstream of approved concern creation
  - no user-visible retry flow exists yet
  - no operator/admin replay path exists yet
  - no background job runner exists yet

  So adding another internal endpoint now would be premature extra surface area rather than a concrete current-phase requirement.

  ### Retry semantics

  Phase 4 retry behavior is intentionally minimal and server-owned.

  If approved concern creation succeeds but routing fails:

  - submit-concern still returns its existing approved success response
  - the approved concern remains stored
  - no deliveries are created unless routing fully succeeds

  Duplicate routing prevention is still exact:

  - routing service checks for existing deliveries before OpenAI
  - atomic DB write helper rejects writes if any delivery already exists for the concern
  - DB uniqueness remains final guard:
      - UNIQUE (concern_id, recipient_profile_id)
      - UNIQUE (concern_id, routing_order)

  No explicit replay endpoint is added in Phase 4.
  Operational/manual retry can be added later when the repository adds a concrete trusted retry path.

  ## Public and Internal Contracts

  ### submit-concern

  Keep the current public contract unchanged.

  Approved response stays:

  - { status: "approved", concernId }

  Blocked response stays:

  - { status: "blocked", code, userMessage }

  Reason:

  - no current app flow consumes routing outcome
  - expanding the client contract in a backend-routing step is unnecessary API surface growth
  - current repository rules prefer minimal, coherent change

  ### Internal routing contracts

  Add src/features/routing/contracts.ts.

  Internal request schema used by shared routing service:

  - z.object({ concernId: z.string().uuid() }).strict()

  Internal service result shapes:

  - routed
      - { status: "routed", concernId, eligibleCandidateCount, deliveryCount }
  - no_delivery
      - { status: "no_delivery", concernId, eligibleCandidateCount: 0, deliveryCount: 0 }
  - already_routed
      - { status: "already_routed", concernId, deliveryCount }

  Internal service error codes:

  - concern_not_found
  - concern_not_real
  - concern_author_not_routable
  - routing_unavailable
  - routing_model_refused
  - routing_output_missing
  - routing_output_invalid
  - delivery_creation_failed

  These remain server-internal in Phase 4.

  ## Routing Logic

  Add shared routing modules under src/features/routing/server:

  - eligibility.ts
  - openai-routing.ts
  - route-concern-service.ts

  ### Eligibility filtering

  Eligible profiles must satisfy all of:

  - onboarding_completed = true
  - gender is not null
  - at least one profile_interests row exists
  - is_active = true
  - is_blocked = false

  Exclude:

  - concern author
  - users already assigned to the same concern
  - users who already responded to the same concern

  ### Required delivery count

  Exact rule:

  - eligible pool >= 3 -> 3
  - eligible pool 2 -> 2
  - eligible pool 1 -> 1
  - eligible pool 0 -> 0

  ### No-delivery behavior

  If eligible count is 0:

  - do not call OpenAI
  - do not create deliveries
  - return no_delivery
  - do not use example concerns
  - do not fabricate recipients

  ### OpenAI input assembly

  Author snapshot:

  - gender
  - interests ordered by interest_key
  - concern_body

  Candidate snapshot:

  - profile_id
  - gender
  - interests ordered by interest_key
  - all prior authored concern bodies ordered by created_at asc
  - all prior written response bodies ordered by created_at asc

  Prototype rule:

  - include all present in-app history
  - no summarization
  - no recent-N truncation

  ## OpenAI Responses API Contract

  ### Request body

  openai-routing.ts sends one POST https://api.openai.com/v1/responses request using raw fetch().

  Exact request body shape:

  {
    "model": "gpt-5-mini",
    "input": [
      {
        "role": "system",
        "content": [
          {
            "type": "input_text",
            "text": "The server already filtered the eligible responder pool. Return exactly the required number of responder profile ids from
the provided eligible candidates. Never return ids outside the pool. Never return duplicates. If perfect matches do not exist, still choose
the best available candidates from the eligible pool. Return only JSON that matches the supplied schema."
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "<JSON.stringify(routingInput)>"
          }
        ]
      }
    ],
    "text": {
      "format": {
        "type": "json_schema",
        "name": "route_concern_selection",
        "strict": true,
        "schema": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "responder_profile_ids": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "minItems": "<required_delivery_count>",
              "maxItems": "<required_delivery_count>"
            }
          },
          "required": ["responder_profile_ids"]
        }
      }
    }
  }

  ### Verified parser contract

  The implementation must parse only the documented raw Responses API success shape that is confirmed for this exact request format.

  Fixed parser rule:

  1. read response.output
  2. find the first item where type === "message"
  3. within that message, find the first content item where type === "output_text"
  4. read content.text
  5. JSON.parse(content.text)
  6. validate the parsed value against the strict Zod schema

  This is the only parser branch included in the Phase 4 implementation contract.

  Conservative handling rule:

  - do not add any second parser branch for alternative content types unless that alternative shape is explicitly confirmed by the
    documentation being used for this exact request format
  - any other 2xx response shape, including a message without output_text, is treated as routing_output_missing
  - if the expected output_text item exists but content.text is not valid JSON, treat it as routing_output_invalid

  ### Failure mapping

  Keep fail-closed behavior exact:

  - OpenAI network failure or HTTP non-2xx -> routing_unavailable
  - refusal content item under the documented message content shape -> routing_model_refused
  - 2xx response missing the verified message -> output_text -> text path -> routing_output_missing
  - invalid JSON in extracted output_text -> routing_output_invalid
  - schema mismatch -> routing_output_invalid
  - IDs outside eligible pool -> routing_output_invalid
  - duplicate IDs -> routing_output_invalid
  - wrong count -> routing_output_invalid
  - DB write failure after valid model output -> delivery_creation_failed

  ### Fail-closed rule

  If eligible pool is non-empty:

  - any refusal, missing structured payload, schema-invalid output, out-of-pool ID, duplicate ID, or wrong-count output is a hard routing
    failure
  - server never converts invalid model output into no_delivery
  - server never tops off or mixes model output with server-selected recipients

  ## DB Migration Strategy

  Add one Phase 4 migration.

  ### Ordering column

  Add to public.concern_deliveries:

  - routing_order integer not null
  - check (routing_order > 0)
  - unique (concern_id, routing_order)

  Reason:

  - OpenAI order must be preserved explicitly for later reads
  - timestamps/UUIDs are not a safe ordering contract

  ### Atomic write helper

  Keep the write path as internal as possible.

  Strict implementation order:

  1. first implement private.create_real_concern_deliveries(p_concern_id uuid, p_recipient_profile_ids uuid[])
  2. call that private helper directly from the Edge Function service-role database client if repository-local tooling permits it
  3. add a public service-role-only wrapper only if actual repository-local tooling prevents direct invocation of the private helper
  4. if that wrapper fallback is required, state explicitly in the final report that the wrapper was added because of verified tooling
     constraints, not by architectural preference

  Preferred path:

  - private helper only
  - no public wrapper

  Helper behavior:

  - verify concern exists and source_type = 'real'
  - verify recipient array length is 1..3
  - verify recipient IDs are distinct
  - verify no delivery rows already exist for the concern
  - insert deliveries via unnest(... ) with ordinality
  - store ordinality as routing_order
  - rely on existing self-delivery trigger as final DB guard
  - execute atomically in one SQL function call
  - if any part fails, persist no partial deliveries

  Notification writes are intentionally excluded from this helper in Phase 4.

  ## Logging

  Add minimal structured routing logs:

  - routing_requested
  - routing_eligible_pool_computed
  - routing_required_count_computed
  - routing_openai_started
  - routing_openai_succeeded
  - routing_openai_failed
  - routing_output_validated
  - routing_output_invalid
  - routing_delivery_created
  - routing_delivery_failed

  Log fields:

  - concernId
  - author profile id
  - eligible count
  - required count
  - output count
  - error code/message

  Do not log:

  - raw concern body
  - full candidate history
  - secrets

  ## Notification Handling

  Notification-row creation is not included in Phase 4.

  Exact rule:

  - successful routing creates only concern_deliveries
  - Phase 4 creates no notifications rows
  - Phase 4 sends no Expo push notifications

  Reason:

  - this keeps Phase 4 aligned with the routing-critical backend scope
  - avoids ambiguous TODO treatment
  - avoids partially implementing notification behavior before the notifications phase

  ## Test Plan

  Add focused Vitest tests under src/features/routing/server.

  eligibility.test.ts

  - eligible pool >= 3 returns required count 3
  - eligible pool 2 returns 2
  - eligible pool 1 returns 1
  - eligible pool 0 returns 0
  - excludes author
  - excludes blocked/inactive/non-onboarded/missing-gender/no-interest users
  - excludes already-assigned users
  - excludes already-responded users
  - candidate history includes all prior concern bodies and all prior response bodies

  openai-routing.test.ts

  - accepts exact ordered valid output using the verified message -> output_text -> text path
  - rejects refusal content
  - rejects 2xx payloads missing the verified structured-output path
  - rejects malformed JSON in the verified output_text path
  - rejects schema mismatch
  - rejects out-of-pool IDs
  - rejects duplicates
  - rejects too many
  - rejects too few
  - no path returns model-level no match

  route-concern-service.test.ts

  - eligible 0 skips OpenAI and returns no_delivery
  - valid ordered model output is passed unchanged to atomic write dependency
  - server never tops off invalid model output
  - already-routed concern returns already_routed
  - example concern is rejected
  - DB write failure maps to delivery_creation_failed

  submit-concern-service.test.ts

  - blocked moderation path never invokes routing
  - approved concern path invokes routing service after concern persistence
  - routing failure does not change approved submit-concern response contract

  ## TODO.md Updates

  Check only these items if implemented and tested:

  - ## 8
      - 서버 라우팅 eligibility filter를 구현한다.
      - 라우팅 대상 수를 서버에서 먼저 계산한다.
      - OpenAI 라우팅 입력 계약을 그대로 구현한다.
      - OpenAI의 책임을 명확히 구현한다.
      - OpenAI 출력 계약을 schema-validated structured output으로 고정한다.
      - 서버 책임을 명확히 구현한다.
  - ## 16
      - 라우팅 테스트를 작성한다.

  Leave untouched and unchecked:

  - notification-related items in ## 8
  - notification section items in ## 13
  - push/logging grouped items in ## 17
  - all UI, Inbox, response, feedback, and example-concern items

  ## Assumptions

  - submit-concern public response contract remains unchanged in Phase 4.
  - direct in-process routing from submit-concern is the only routing path added in this phase.
  - no notification rows and no push dispatch are created in this phase.
  - the SQL helper follows a strict fallback rule: private-only first, public service-role-only wrapper only if real tooling constraints
    force it.
