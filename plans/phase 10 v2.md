# Navigation Spike With Evidence Gate

## Step 1: Navigation Spike Before Any Broader Work

The first implementation step is a navigation-only spike used only to prove or reject the root-level Tabs assumption against the current
repo behavior.

Allowed spike changes only:

- app/_layout.tsx
- app/profile/index.tsx
- optional app/profile/_layout.tsx only if needed for shell consistency

Allowed spike work only:

- change navigator declaration
- configure hidden bootstrap screens
- add a visible Profile tab stub
- perform verification of existing routing/bootstrap behavior

Not allowed during the spike:

- Profile business logic
- solved-count logic
- SQL/migration changes
- TODO updates unrelated to the spike outcome
- unrelated UI cleanup
- changing feature files outside the declared spike scope

## Strict Scope Guard

- If any file outside the declared spike scope must be changed to make the spike pass, the spike is considered failed.
- Do not treat broader edits as acceptable “small fixes.”
- If any bootstrap logic file would need changes beyond navigator shell configuration, the spike is failed:
    - app/index.tsx
    - app/onboarding.tsx
- If the spike fails under this guard, fallback to the nested route-group tabs shell becomes mandatory before any broader work.

## Spike Pass Criteria

The spike passes only if all of the following are true immediately after the spike:

- tab bar does not appear on /
- tab bar does not appear on /onboarding
- current index.tsx bootstrap redirect behavior remains unchanged
- current onboarding completion redirect behavior remains unchanged
- authenticated vs onboarding-incomplete entry flow remains unchanged
- absolute pushes and deep links to existing detail routes still resolve exactly as before
- notification-open navigation still resolves the same pathnames as before
- no existing route/path behavior changed
- no bootstrap logic file had to be touched beyond navigator shell configuration
- no file outside the spike scope was changed

## Spike Fail Criteria

The spike fails if any one of these occurs:

- any pass criterion above is not satisfied
- any route/path behavior changes
- any bootstrap logic file must be edited beyond shell configuration
- any file outside the spike scope must be changed
- fixing shell behavior requires broader route rewrites or feature-code adjustments

## Mandatory Evidence / Reporting Contract

After the spike, before any broader implementation begins, the agent must produce a spike outcome report in exactly this structure:

### 1. Spike Files Changed

- exact files changed during the spike
- no extra files omitted

### 2. Spike Outcome

- passed or failed

### 3. Pass-Criterion Verification

For each criterion, report the concrete verification performed:

- tab bar hidden on /
    - verification performed:
- tab bar hidden on /onboarding
    - verification performed:
- index bootstrap redirect unchanged
    - verification performed:
- onboarding completion redirect unchanged
    - verification performed:
- authenticated vs onboarding-incomplete flow unchanged
    - verification performed:
- absolute pushes and deep links unchanged
    - verification performed:
- notification-open navigation pathnames unchanged
    - verification performed:
- no route/path behavior changed
    - verification performed:
- no bootstrap logic file touched beyond shell config
    - verification performed:
- no out-of-scope file edits
    - verification performed:

Each line must state what was actually checked, not just a conclusion.

### 4. Route / Bootstrap Change Statement

- whether any existing route/path behavior changed: yes or no
- whether any bootstrap logic file had to be touched beyond navigator shell configuration: yes or no

### 5. Failure Trigger

- if the spike failed:
    - exact failure condition that triggered fallback
- if the spike passed:
    - state none

## Immediate Next-Action Rule

- If the spike passes:
    - proceed with the rest of the current plan unchanged
- If the spike fails:
    - stop broader work immediately
    - switch to the fallback nested route-group tabs shell first
    - then return a revised file-level implementation plan before continuing

## Rest Of Plan After A Passed Spike

Unchanged from the current approved plan:

- minimal Profile scope only
- solved-count derived only from real concern + positive feedback
- required example-concern exclusion checks
- required moderation persistence checks
- conservative TODO updates
