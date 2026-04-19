# Phase 2 Implementation Plan: Anonymous Auth + Onboarding

  ## Summary

  - This phase implements only:
      - anonymous auth bootstrap
      - session/profile gate
      - onboarding
      - temporary post-onboarding handoff to /inbox
  - Source-of-truth documents for this phase:
      - docs/RULE.md
      - docs/MVP.md
      - docs/function.md
      - docs/user_flow.md
      - TODO.md
  - The following contracts were checked across those docs and are consistent for this phase:
      - anonymous auth is used
      - onboarding fields are gender + interests (multi-select)
      - Korean-only UI
      - after onboarding, the app hands off to an inbox-like first screen
      - concern submission, moderation, routing, inbox real data, responses, feedback, and notifications are out of scope here
  - From docs/user_flow.md, this phase specifically takes:
      - collect gender and interests on first launch
      - onboarding acts as a first-run gate
      - after onboarding, the first destination should feel like “concerns waiting for my response”
  - /inbox in this phase is only a temporary handoff route. It is not the real inbox implementation.

  ## Planned Files

  - package.json
  - app.json
  - tsconfig.json
  - babel.config.js
  - .env.example
  - app/_layout.tsx
  - app/index.tsx
  - app/onboarding.tsx
  - app/inbox.tsx
  - src/lib/supabase.ts
  - src/lib/logger.ts
  - src/features/session/context.tsx
  - src/features/session/bootstrap.ts
  - src/features/session/gate.ts
  - src/features/onboarding/constants.ts
  - src/features/onboarding/validation.ts
  - src/features/onboarding/api.ts
  - src/features/onboarding/validation.test.ts
  - src/features/session/gate.test.ts
  - one new migration
  - TODO.md

  ## Implementation Changes

  ### 1. Minimal app scaffold

  - Use only Expo + React Native + TypeScript + Expo Router.
  - Do not add TanStack Query in this phase.
  - Do not add React Hook Form in this phase.
  - Reason: this phase only needs session bootstrap, profile fetch, one onboarding submit path, and a temporary /inbox placeholder.

  ### 2. Profile bootstrap on auth user creation

  - Add a migration that creates an auth.users insert trigger.
  - When anonymous sign-in creates a new auth user, the DB automatically creates public.profiles(id).
  - Initial values stay fixed:
      - gender = null
      - onboarding_completed = false
      - is_active = true
      - is_blocked = false

  ### 3. RPC execution and privilege model

  - Onboarding completion uses exactly one write path:
      - public.complete_onboarding(p_gender public.gender_type, p_interest_keys text[]) returns void
  - This is not a generic server proxy.
  - It is a constrained privileged DB write path directly callable by an authenticated client.
  - Migration must explicitly manage privileges:
      - revoke from public
      - revoke from anon
      - grant EXECUTE to authenticated
  - Direct normal table writes remain disallowed:
      - no normal client insert/update policy for profiles
      - no onboarding-related direct client writes to profile_interests
  - Implementation rule for this phase:
      - complete_onboarding(...) is the only allowed protected onboarding write path
      - no onboarding Edge Function
      - no generic profiles update helper
      - no generic profile_interests write helper

  ### 4. RPC security, error surface, and dedupe ownership

  - The RPC is SECURITY DEFINER.
  - It must never accept an external target profile id.
  - It acts only on auth.uid().
  - It uses set search_path = public, pg_temp.
  - Server-side dedupe ownership is explicit:
      - the RPC owns deduping interest_keys
      - the client does not normalize duplicates in this phase
  - Defensive validation stance:
      - client validation checks canonical gender, canonical interest keys, and minimum selection
      - client validation does not fail solely because duplicate keys appear
      - this is only a defensive contract, not a request for client-side duplicate normalization
      - normal UI state should still maintain a unique selected set

  #### Stable app-facing RPC error contract

  - The client depends only on a stable machine-readable error tag.
  - The client does not depend on human-readable DB error messages.
  - The tag is returned in the PostgREST/Supabase RPC error object via error.details.
  - This field is the only app-facing classification input for this phase.
  - Stable tags for this phase:
      - app_error:onboarding_missing_auth
      - app_error:onboarding_profile_missing
      - app_error:onboarding_empty_interests
      - app_error:onboarding_invalid_interests
  - The RPC may still raise SQL errors internally, but the app contract is:
      - read error.details
      - interpret only the stable tag
      - ignore message text for behavior decisions
  - Client-side classification mapping is fixed for this phase:
      - validation:
          - app_error:onboarding_empty_interests
          - app_error:onboarding_invalid_interests
      - bootstrap/state error:
          - app_error:onboarding_missing_auth
          - app_error:onboarding_profile_missing
      - unknown tag or missing tag:
          - treat as bootstrap_or_state_error

  #### RPC failure behavior

  - The RPC explicitly raises failures for:
      - missing auth.uid()
      - missing profiles row for the authenticated user
      - deduped interests becoming empty
      - one or more invalid interest keys
  - The client maps those using the stable tag in error.details, not the message text.

  #### RPC execution order

  - auth.uid() check
  - profiles row existence check
  - dedupe p_interest_keys
  - ensure deduped array is non-empty
  - validate all keys against public.interests.key
  - delete existing profile_interests
  - insert new profile_interests
  - update profiles.gender
  - update profiles.onboarding_completed = true

  ### 5. profile_interests implementation rule

  - In this phase, absolutely no onboarding-related profile_interests client write path exists outside complete_onboarding(...).
  - App code must not introduce any supabase.from('profile_interests') insert/update/delete for onboarding.
  - Future direct client interest editing is a later-phase decision only.

  ### 6. Session ownership boundary

  - Canonical session state lives in src/features/session/context.tsx.
  - SessionProvider is mounted once from app/_layout.tsx.
  - SessionProvider responsibilities:
      - initial supabase.auth.getSession()
      - one supabase.auth.onAuthStateChange(...) subscription
      - cleanup on unmount
  - SessionProvider must not own:
      - profile fetch logic
      - bootstrap retry logic
      - route/gate decision logic
  - app/index.tsx is the sole bootstrap/gate owner, using session state from the provider.
  - Session changes propagate to the gate through provider state updates only.
  - No duplicate auth subscriptions outside the provider.

  ### 7. Bootstrap duplication guard and stale-run handling

  - Bootstrap/profile-fetch logic must prevent overlapping runs for the same auth state.
  - Use a guard based on:
      - currentBootstrapKey = session.user.id ?? 'no-session'
      - inFlightRef
      - runId
  - Authoritative run rule:
      - the latest started run for the current bootstrap key is authoritative
  - A run becomes stale when:
      - a newer run starts for the same bootstrap key, or
      - the bootstrap key changes because auth state changed
  - Handling stale async results:
      - before applying any async result to component state, compare its runId and bootstrap key to the current authoritative values
      - if they no longer match, ignore the result completely
  - This prevents:
      - duplicate profile fetch writes to state
      - late async completion from an older run overwriting newer gate state

  ### 8. Temporary router structure

  - app/_layout.tsx:
      - providers only
      - session provider only
  - app/index.tsx:
      - temporary phase-2 bootstrap gate only
      - sign-in if no session
      - fetch profile if session exists
      - decide route
      - replace to /onboarding or /inbox
  - /inbox remains explicitly temporary:
      - no real inbox query
      - no concern list
      - no extra UI/data work attached in this phase
      - intended to be replaced later by the real tab/navigation structure

  ### 9. Retry UX and limitation

  - Profile fetch retry schedule:
      - immediate
      - 200ms
      - 400ms
      - 800ms
      - 1600ms
  - Failure-state action semantics:
      - reset local bootstrap state
      - retry profile/bootstrap evaluation for the same session
      - do not sign out
      - do not create a new anonymous user automatically
      - do not re-register auth subscriptions
  - UX wording must not overpromise recovery.
  - This screen is primarily a minimal operational/debugging aid for bootstrap inconsistency, not a strong end-user recovery flow.
  - Suggested button meaning:
      - “check status again”, not “fully recover”
  - If the trigger/profile bootstrap is permanently broken, this phase does not solve deeper recovery.

  ### 10. Diagnostics

  - src/lib/logger.ts is a lightweight structured logger.
  - Minimum shape:

  {
    event: string;
    stage?: 'auth' | 'profile_bootstrap' | 'onboarding_rpc';
    attempt?: number;
    hasSession: boolean;
    userIdPresent: boolean;
    errorCode?: string;
    errorMessage?: string;
    errorTag?: string;
  }

  - Required events:
      - sign_in_anonymous_started
      - sign_in_anonymous_succeeded
      - sign_in_anonymous_failed
      - profile_fetch_attempted
      - profile_fetch_succeeded
      - profile_fetch_failed
      - complete_onboarding_rpc_started
      - complete_onboarding_rpc_failed
      - complete_onboarding_rpc_succeeded
  - If an RPC error carries a stable tag in error.details, also log it as errorTag.

  ### 11. Onboarding UI

  - Single onboarding screen only.
  - Gender options:
      - male
      - female
  - Interest options:
      - fixed 20 canonical keys
  - UI renders from src/features/onboarding/constants.ts, not from a live DB fetch.
  - Order is fixed by app constant order:
      - job_search
      - career_path
      - study
      - exam
      - income
      - housing
      - romance
      - marriage
      - parents
      - children
      - depression
      - anxiety
      - loneliness
      - workplace
      - work_life_balance
      - appearance
      - self_esteem
      - health
      - retirement
      - future

  ### 12. Submit flow and read-after-write tradeoff

  - Client-side validation checks:
      - gender required
      - at least one interest key present
      - canonicality only
  - Submit flow:
      - log complete_onboarding_rpc_started
      - call RPC
      - on success, log complete_onboarding_rpc_succeeded
      - re-fetch profile
      - re-evaluate gate
      - replace to /inbox
  - The RPC remains void.

  #### Why void is still the right phase-2 choice

  - This is an intentional consistency-first tradeoff for phase 2.
  - The app’s canonical onboarded state is the persisted profiles row, not the write response.
  - App bootstrap on later launches also depends on reading that same persisted state.
  - Returning a success payload now would create a second temporary truth source with limited benefit, because /inbox is only a placeholder
    route in this phase.
  - Therefore phase 2 explicitly prioritizes:
      - one canonical persisted state source
      - forced read-after-write confirmation
      - consistent gate behavior now and on future app launches
  - This choice is temporary and may be revisited later when the real inbox/navigation structure exists and optimistic handoff has
    meaningful UX value.

  #### Re-fetch failure after successful RPC

  - If RPC succeeds but immediate profile re-fetch fails:
      - stay on onboarding
      - keep selections
      - allow retry
      - do not create a new anonymous user
  - User copy should stay cautious:
      - “We could not confirm yet whether your settings were reflected. Please check again shortly.”
  - This is intentional in phase 2 because consistency is prioritized over faster optimistic handoff.

  ## Testing Requirements

  - This phase must include minimal automated tests, not only “testable later” structure.

  ### Included automated tests

  - src/features/onboarding/validation.test.ts
  - src/features/session/gate.test.ts

  ### Test-ready module contracts

  #### Onboarding validation

  type OnboardingInput = {
    gender: string | null;
    interestKeys: string[];
  };

  function validateOnboardingInput(input: OnboardingInput): {
    success: boolean;
    fieldErrors: {
      gender?: string;
      interestKeys?: string;
    };
  };

  - Must cover:
      - valid input
      - missing gender
      - empty interest array
      - invalid interest key
      - duplicate keys do not fail validation by themselves

  #### Gate decision

  type GateInput = {
    hasSession: boolean;
    bootstrapStatus: 'idle' | 'loading' | 'failed';
    profile: {
      onboardingCompleted: boolean;
      gender: 'male' | 'female' | null;
    } | null;
  };

  function decideGateRoute(input: GateInput): 'loading' | 'onboarding' | 'inbox' | 'fatal-error';

  - Must cover:
      - no session + loading
      - session exists + profile missing + loading
      - onboarded profile
      - not onboarded profile
      - bootstrap failed

  ### Bootstrap control testability requirement

  - Retry/backoff scheduling and stale-run guard logic must be factored into a dependency-light module or helper surface in src/features/
    session/bootstrap.ts.
  - Do not bury all bootstrap control behavior inside a single opaque component effect.
  - Even if no bootstrap unit test is added in this phase, the logic must be structured so it can be unit-tested later.

  ## TODO.md Update Rule

  - After implementation, update TODO.md conservatively per docs/RULE.md.
  - Check only:
      - Supabase anonymous auth 흐름을 연결한다.
      - 첫 세션 생성 시 profiles를 함께 생성한다.
      - 온보딩 화면에서 성별 + 관심분야(복수 선택)를 수집한다.
      - 필수값 미입력 시 온보딩 완료를 허용하지 않는다.
      - 온보딩 완료 후 Inbox로 이동시킨다.
      - 앱 재실행 시 온보딩 완료 여부를 보고 진입 경로를 결정한다.
  - Do not check:
      - profile editing items
      - real inbox data items
      - concern/moderation/routing/response/feedback/notification items
      - broader navigation items

  ## Assumptions And Defaults

  - If source documents conflict during implementation, report it explicitly rather than guessing.
  - Onboarding UI does not depend on reading interests from the DB at runtime.
  - Protected onboarding writes use exactly one RPC with explicit migration grants/revokes.
  - /inbox is temporary in phase 2 and does not imply real inbox behavior.
  - Bootstrap failure UI remains a minimal operational/debugging aid, not a comprehensive recovery feature.