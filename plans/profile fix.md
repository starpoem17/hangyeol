## Tightened Plan Around Onboarding Constants Scope

### Root cause

The current deploy blocker exists because supabase/functions/get-profile-summary/index.ts imports through the Expo app feature tree (src/
features/profile/server/...), and that path depends on other app-owned modules under src/features/....

So the real problem is the runtime import boundary:

- Edge Functions need a server-safe import path
- today that path runs back through Expo feature ownership
- that makes Deno/function bundling sensitive to app-side module conventions

This problem can be fixed without making src/features/onboarding/constants.ts part of the runtime dependency path for the function.

### Shared boundary fix

Answering the two questions separately:

Question A: what new shared modules are needed?

Use a small neutral shared layer outside both src/features/... and supabase/functions/...:

- shared/domain/canonical-interest-keys.ts
- shared/profile/profile-summary-core.ts

Purpose:

- shared/domain/canonical-interest-keys.ts
    - exports only the canonical interest keys needed by server-safe consumers
    - gives Edge Functions a neutral source for interest-key filtering
- shared/profile/profile-summary-core.ts
    - contains the pure summary-shaping logic now embedded in the app-side profile summary service
    - depends only on neutral shared modules, not Expo feature modules

Consumption:

- supabase/functions/get-profile-summary/index.ts imports shared/profile/profile-summary-core.ts
- src/features/profile/server/profile-summary-service.ts also imports that same core

That gives get-profile-summary and future Edge Functions a boundary-safe pattern without importing through the Expo feature tree.

### Strictly required file changes

Existing files to edit: 2

- supabase/functions/get-profile-summary/index.ts
    - replace the import of the app-side service with the shared core
    - keep auth, DB calls, request handling, and JSON response flow unchanged
- src/features/profile/server/profile-summary-service.ts
    - turn it into a thin wrapper around the shared core
    - keep the current dependency-injection surface unchanged

New files to add: 2

- shared/domain/canonical-interest-keys.ts
    - neutral runtime source of canonical interest keys for server-safe consumers
- shared/profile/profile-summary-core.ts
    - neutral pure logic for solved-count normalization, canonical interest filtering, and output shaping

Recommended safety test change: 1

- add or update a test to assert that the shared canonical interest keys stay in sync with src/features/onboarding/constants.ts
    - this is not needed for function bundling itself
    - it is the safety mechanism that lets us avoid rewiring onboarding constants right now without accepting silent semantic drift

### Whether onboarding constants must change now

Recommendation: no, src/features/onboarding/constants.ts does not need to change in this patch.

Reason:

- the deploy blocker is caused by the function runtime import path, not by the mere existence of onboarding constants under src/
features/...
- once get-profile-summary consumes only the neutral shared layer, the function no longer depends on onboarding constants at runtime
- future Edge Functions can also use the shared domain module directly without going through the Expo onboarding feature

So for this patch:

- src/features/onboarding/constants.ts can remain the app-owned source used by the Expo app
- the shared layer can provide the server-safe runtime copy needed by Edge Functions
- alignment between the two is enforced by a test, not by rewiring app ownership right now

I would keep onboarding constants out of the required edit set unless implementation reveals that the app types/values cannot stay aligned
without a runtime re-export. Based on current code shape, that does not look necessary.

### Risk tradeoff

If we do not change onboarding constants now:

- benefit:
    - smallest app-side regression surface
    - deploy blocker is still removed
    - future Edge Functions still get a neutral runtime path
- cost:
    - canonical interest keys exist in two runtime locations
- mitigation:
    - add a parity test that compares the shared canonical interest keys with the existing onboarding constants so semantic drift fails
    fast in CI

If we do change onboarding constants now:

- avoided risk:
    - removes duplicate ownership of canonical interest values
- added risk:
    - touches app-side onboarding behavior for a deploy blocker that does not require it
    - broadens regression surface in the Expo app unnecessarily

Given your priority to keep app-side risk tight, the better tradeoff is:

- do not edit onboarding constants now
- do add a parity test
- do move only the function-critical runtime path to the neutral shared layer

### Files intentionally left unchanged

- src/features/onboarding/constants.ts
- tsconfig.json
- any root TypeScript policy
- any app-wide .ts import convention
- supabase/functions/get-profile-summary/deno.json
- unrelated Edge Functions
- unrelated Expo feature modules
- app-facing get-profile-summary JSON contract and semantics
