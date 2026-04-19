# Final MVP DB Foundation Plan

  ## Summary

  - profiles.id = auth.users.id is the 1:1 app-level human user table. Example concern authors never use profiles.
  - TODO.md remains the stricter source of truth over the older stack sketch, so the schema will have no catch-all concerns.status and no
    moderation-result columns in user-facing product tables.
  - Protected profile fields stay server-owned in MVP:
      - is_blocked: admin/server-only
      - is_active: admin/server-only
      - onboarding_completed: server-only
      - gender: written through onboarding/server path, not freely client-editable
  - gender is a closed category at the DB/product-contract level: exactly male or female.
  - Interests are closed categories, stored in a normalized lookup table plus profile_interests, with fixed canonical keys and Korean
    display labels.
  - Onboarding UI contract is fixed:
      - gender = single-select button/chip
      - interests = multi-select button/chip
      - no free-text entry
  - onboarding_completed = true requires valid gender plus at least one selected interest in the onboarding server transaction.
  - Example concerns are not broadly browsable. They will later be surfaced only through server-controlled inbox selection.
  - responses read access is intentionally minimal in MVP: only the assigned recipient and, for real concerns, the concern author.
  - response_feedback is insert-only, and read access is explicitly locked to the underlying real concern author only in MVP.

  ## Planned Files

  - supabase/config.toml
  - supabase/migrations/20260417230000_mvp_db_foundation.sql
  - No DB test file in this step, because the repo still has no existing DB/Supabase test location to extend.

  ## Implementation Changes

  - Create public.gender_type enum with exactly: male, female.
  - Create public.profiles with id uuid primary key references auth.users(id), gender public.gender_type, onboarding_completed boolean not
    null default false, is_active boolean not null default true, is_blocked boolean not null default false, timestamps, and a CHECK that
    forbids onboarding_completed = true when gender is null.
  - Create public.interests as a fixed lookup table with:
      - key text primary key
      - label_ko text not null unique
      - seed exactly these 20 canonical rows:
          - job_search / 취업
          - career_path / 진로
          - study / 학업
          - exam / 시험
          - income / 소득
          - housing / 주거
          - romance / 연애
          - marriage / 결혼
          - parents / 부모
          - children / 자녀
          - depression / 우울
          - anxiety / 불안
          - loneliness / 외로움
          - workplace / 직장
          - work_life_balance / 워라밸
          - appearance / 외모
          - self_esteem / 자존감
          - health / 건강
          - retirement / 노후
          - future / 미래
  - Create public.profile_interests(profile_id, interest_key, created_at) with primary key (profile_id, interest_key) and FK to
    public.interests(key).
  - Create public.concerns for approved user-facing concerns only: id, source_type, author_profile_id, example_key, body, timestamps, and a
    named CHECK enforcing:
      - real => author_profile_id is not null and example_key is null
      - example => author_profile_id is null and example_key is not null
  - Create public.concern_deliveries with id, concern_id, recipient_profile_id, status, delivered_at, opened_at, responded_at, unique
    (concern_id, recipient_profile_id), timestamp-order checks, and a trigger that rejects self-delivery when recipient matches the real
    concern author.
  - Create public.responses with id, delivery_id unique references concern_deliveries(id), body, timestamps. Responder identity is derived
    only from delivery_id.
  - Create public.response_feedback with id, response_id, concern_author_profile_id, liked boolean not null, comment_body text null,
    timestamps, unique (response_id, concern_author_profile_id), and a trigger that rejects feedback unless the underlying concern is real
    and the feedback actor matches that real concern’s author.
  - Create public.push_tokens with id, profile_id, expo_push_token, platform, timestamps, unique (expo_push_token), and a non-unique index
    on profile_id.
  - Create public.notifications with id, profile_id, type, related_entity_type, related_entity_id uuid, read_at nullable, created_at.
  - Create separate admin-only audit storage in private.moderation_audit_entries with subject_type, actor_profile_id nullable,
    raw_submitted_text, blocked, category_summary jsonb, raw_provider_payload jsonb, checked_at, approved_entity_type nullable, and
    approved_entity_id uuid nullable.

  ## Enum / Value Sets

  - profiles.gender: male, female
  - concerns.source_type: real, example
  - concern_deliveries.status: assigned, opened, responded
  - notifications.type: concern_delivered, response_received, response_liked, response_commented
  - notifications.related_entity_type: concern, concern_delivery, response, response_feedback
  - push_tokens.platform: ios, android
  - private.moderation_audit_entries.subject_type: concern, response, response_feedback_comment
  - private.moderation_audit_entries.approved_entity_type: concern, response, response_feedback

  ## RLS / Enforcement Rules

  - profiles:
      - authenticated users can select only their own row
      - no normal client insert or update policy
      - profile creation, onboarding completion, gender writes, and protected-field changes go through server/service-role paths
  - interests: authenticated read-only.
  - profile_interests:
      - users can read/insert/delete only their own rows
      - this is intentionally allowed both during onboarding and later profile editing in MVP
      - the server onboarding path still owns the transition to onboarding_completed = true
  - concerns:
      - authors can read only their own real concerns
      - no broad client read policy for example concerns
      - no client insert/update/delete
  - concern_deliveries: recipients can read only their own deliveries. No client insert/update/delete.
  - responses:
      - only the assigned recipient can insert one response for that delivery
      - reads allowed only to that recipient and, for real concerns, the concern author
      - this is the full intended MVP read scope for now; no extra “my past responses” browsing policy
      - no client update/delete
  - response_feedback:
      - concern author may insert only their own row for a real concern response
      - concern author may select only their own row for that real concern response
      - no client update or delete
  - push_tokens: users can read/insert/update/delete only their own rows.
  - notifications:
      - users can read only their own rows
      - users may update only their own rows under RLS
      - a BEFORE UPDATE trigger rejects any update that changes columns other than read_at
  - private.moderation_audit_entries: no access for anon or authenticated; service-role/server only.

  ## Test Plan

  - Constraint tests:
      - profiles.gender accepts only male or female
      - concerns source-type check
      - unique (concern_id, recipient_profile_id)
      - unique (delivery_id)
      - unique (response_id, concern_author_profile_id)
      - self-delivery rejection
      - example-feedback rejection
      - onboarding_completed = true rejected when gender is null
      - expo_push_token global uniqueness
      - notifications immutable except for read_at
  - Seed/lookup tests:
      - exactly 20 interest rows exist with the fixed canonical keys and Korean labels
      - profile_interests rejects unknown interest keys
  - RLS tests:
      - own-profile read only, no direct profile update path
      - own profile_interests read/write/delete allowed
      - own-delivery only
      - recipient-only response insert
      - response reads limited to recipient plus real-concern author only
      - concern-author-only feedback insert
      - concern-author-only feedback read
      - no feedback update path
      - own push-token management
      - own notification read plus read_at-only update
      - moderation-audit access denied
  - No new DB test scaffolding yet, because the repo has no existing place for it.

  ## Assumptions / Server Responsibilities

  - The app/server layer must use only canonical stored values for onboarding, routing, and OpenAI input assembly:
      - gender: male or female
      - interests: the fixed interests.key values above
  - The onboarding UI must expose only fixed chips/buttons backed by those canonical values. No free-text normalization path is needed.
  - The onboarding server transaction must:
      - write enum-backed gender
      - write at least one profile_interests row using canonical interest keys
      - then set onboarding_completed = true
  - Post-onboarding interest edits are intentionally allowed in MVP through the user’s own profile_interests rows, and those edits affect
    future routing decisions only. They do not rewrite or reinterpret historical deliveries already created.
  - Example concerns remain server-selected inbox supply, not a generally browsable dataset.
  - responses access remains intentionally narrow in this step; no separate archive or “my answers” feature is part of the DB contract yet.
  - Feedback is insert-only in MVP, and feedback visibility is concern-author-only in this step.
  - Routing count rules, eligibility filtering, moderation writes, notification creation, solved-count derivation, and example-concern
    exclusion from push/analytics remain server-enforced in later steps.
