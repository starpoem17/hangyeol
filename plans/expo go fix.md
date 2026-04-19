## Required finish line

- The app boots on a real device using a fresh Supabase cloud project.
- Anonymous sign-in succeeds.
- Profile bootstrap succeeds.
- Onboarding completes.
- The app reaches the authenticated shell at /inbox.

Scope boundary:

- Success for this pass stops at authenticated shell entry.
- It does not require Inbox data correctness, example concern supply, notification correctness, or broader post-shell feature readiness.

## Strict minimum setup requirements

### Required for the scoped path

- EXPO_PUBLIC_SUPABASE_URL
    - Why required: Expo client initialization depends on it.
    - How verified: app does not throw the required-env error from src/lib/supabase.ts.
- EXPO_PUBLIC_SUPABASE_ANON_KEY
    - Why required: anonymous auth and client-side DB/RPC access depend on it.
    - How verified: app does not throw the required-env error and can call signInAnonymously().
- Supabase Auth anonymous sign-ins enabled
    - Why required: cold start calls supabase.auth.signInAnonymously().
    - How verified: cold launch yields sign_in_anonymous_succeeded.
- Migration 20260417230000_mvp_db_foundation.sql
    - Why required:
        - creates public.profiles
        - creates public.interests
        - creates public.profile_interests
        - defines public.gender_type
        - grants/RLS for self-read on profiles
        - seeds canonical interests
    - How verified:
        - bootstrap no longer errors on missing public.profiles
        - onboarding accepts built-in interest values
- Migration 20260418003000_phase2_anonymous_auth_onboarding.sql
    - Why required:
        - creates handle_new_auth_user()
        - creates trigger on auth.users
        - creates complete_onboarding()
    - How verified:
        - a fresh anonymous auth user gets a readable profiles row
        - onboarding submission succeeds via RPC

### Recommended but not required

- Any migrations after phase 2
    - Why not required: not needed for boot -> onboarding -> authenticated shell entry.
- EXPO_PUBLIC_EAS_PROJECT_ID
    - Why not required: push registration is outside the scoped success condition.

### Outside scope

- Edge Functions
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY
- Example concern supply
- Concern routing
- Notifications correctness
- Profile summary correctness

## Acceptance criteria

### Anonymous sign-in

Success:

- Fresh install / cleared storage cold launch produces:
    - sign_in_anonymous_started
    - sign_in_anonymous_succeeded
- No auth error screen is shown.

Failure signal:

- sign_in_anonymous_failed
- bootstrap never progresses past initial loading

### Profile bootstrap

Success:

- Logs show:
    - profile_fetch_attempted
    - profile_fetch_succeeded
- App routes to /onboarding for a fresh user.
- No fatal bootstrap screen is shown.

Failure signal:

- PGRST205 for public.profiles
- repeated profile_fetch_failed
- repeated "profile row was not found"
- fatal bootstrap UI

### Onboarding completion

Success:

- Submit with one gender and at least one built-in interest.
- Logs show:
    - complete_onboarding_rpc_started
    - complete_onboarding_rpc_succeeded
    - onboarding_completed
- Follow-up profile fetch succeeds.

Failure signal:

- function-not-found / table-not-found / type-not-found errors
- onboarding error indicating auth/profile state failure
- valid built-in interests rejected as invalid

### Authenticated shell entry

Success:

- Navigation leaves /onboarding.
- App lands on /inbox.
- User is in the authenticated route tree, regardless of whether Inbox later loads data successfully.

Failure signal:

- remains on /onboarding
- returns to /
- crashes/hangs before /inbox route entry

## Verification procedure

### A. Verification steps that can be executed directly by me in this pass

1. Inspect the exact SHA and trace the scoped path in code.
    - Evidence:
        - bootstrap path in app/index.tsx
        - auth/session in src/features/session/context.tsx
        - profile read in src/features/session/bootstrap.ts
        - onboarding RPC call in app/onboarding.tsx and src/features/onboarding/api.ts
        - gate logic in src/features/session/gate.ts
        - shell route target /inbox
2. Inspect the minimum migrations and confirm they define the required objects.
    - Evidence:
        - phase 1 creates profiles, interests, profile_interests, grants/RLS, and seed data
        - phase 2 creates trigger + complete_onboarding()
3. Run narrow local tests that exercise touched logic if code changes become necessary, or confirm baseline otherwise.
    - Evidence:
        - targeted test command/results on relevant unit tests

These direct steps can prove:

- what the strict minimum setup is
- whether code changes are logically required from repo inspection
- whether any local code changes are validated by unit tests

These direct steps cannot prove:

- real-device behavior against a real fresh Supabase cloud project
- actual cloud auth settings in the user’s project
- actual migration application state in the user’s cloud DB

### B. Verification steps that can only be specified for the user/operator to run

1. Create a fresh Supabase cloud project.
2. Enable anonymous auth.
3. Apply the two strict-minimum migrations.
4. Set Expo env to the cloud project.
5. Launch on a real device with fresh app state.
6. Observe logs and route transitions.
7. If needed, run SQL spot checks in Supabase SQL editor:
    - select to_regclass('public.profiles');
    - select count(*) from public.interests;
    - select proname from pg_proc where proname = 'complete_onboarding';
    - inspect trigger presence on auth.users

Operator evidence expected if setup is correct:

- cold start signs in anonymously
- profile bootstrap succeeds
- onboarding submit succeeds
- route enters /inbox

Operator failure evidence indicating phase 1/2 missing or misapplied:

- PGRST205 for public.profiles
- missing-row retries after sign-in
- missing/invalid onboarding RPC behavior
- built-in interests rejected as invalid

## Execution policy

Allowed outcomes for this pass:

1. Setup-only conclusion, no code changes
    - This is the default outcome if code inspection and available verification show the scoped path should succeed with correct setup
    alone.
2. Setup-only conclusion plus optional hardening proposal only
    - Allowed if no real scoped blocker is proven, but diagnostics/hardening opportunities are identified.
    - Optional hardening must not be implemented in this pass unless a real scoped blocker is proven.
3. Actual code changes
    - Allowed only if direct verification in this pass proves a real blocker on:
        - boot
        - anonymous sign-in
        - profile bootstrap
        - onboarding completion
        - authenticated shell entry
    - Diagnostics-only or convenience-only improvements do not qualify.

Implementation constraint:

- I must not implement optional hardening unless verification proves it is required to make the scoped path function.

Completion rule for this pass:

- If no real blocker is proven, completion is a setup-focused result, not a code-change result.

## Required changes only

- None currently proven required.
    - Why in this bucket: based on current code inspection, the scoped path can succeed with correct phase 1/2 setup, anonymous auth
    enabled, and correct Expo env.

## Optional hardening only

- src/features/session/bootstrap.ts
    - Possible change: classify PGRST205 missing-table/schema failures as non-retryable.
    - Why optional: improves diagnosis only; does not appear necessary for success when setup is correct.
- app/index.tsx
    - Possible change: show a setup-specific fatal message for missing public.profiles.
    - Why optional: clearer operator feedback only.
- src/features/notifications/push-registration.ts
    - Possible change: make background push-registration failures explicitly best-effort.
    - Why optional: not proven to block the scoped path.
- minimal docs note
    - Possible change: document the strict minimum setup and acceptance checks.
    - Why optional: reproducibility aid only.

## Final deliverable format

After implementation or setup-only conclusion, I will return:

1. Scoped outcome
    - one of:
        - scoped success achieved by setup-only conclusion
        - scoped success not fully verified locally, but setup requirements isolated
        - scoped blocker found and code changes made
2. Files changed, if any
    - every changed file
    - why it changed
    - behavior impact
3. Setup requirements confirmed
    - strict minimum setup items proven from repo inspection
    - whether they are directly verified in this pass or only operator-verifiable
4. Setup requirements still unverified
    - anything that depends on the user’s real cloud project or real device run
5. Verification evidence
    - direct checks I executed in this pass
    - operator verification steps still required
    - whether scoped success is fully proven vs partially pending user-run verification
6. Optional hardening intentionally not implemented
    - list of non-required improvements left out on purpose

## Out-of-scope items

- Inbox data readiness after entering /inbox
- Example concern supply
- Concern posting and routing
- Response/feedback flows
- Notifications correctness
- Profile screen behavior
- Edge Function deployment
- Broad cleanup, refactors, or production hardening beyond the scoped path
