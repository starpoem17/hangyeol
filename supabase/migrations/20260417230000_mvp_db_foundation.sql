-- MVP database foundation for Hangyeol.
-- Locked contracts from docs/ and TODO.md:
-- - profiles are 1:1 with auth.users
-- - gender is a closed enum: male | female
-- - interests are closed canonical lookup rows, not free text
-- - concerns store approved user-facing rows only
-- - moderation raw text and provider payload live only in private audit storage
-- - response_feedback is insert-only and readable only by the real concern author

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres;
grant usage on schema private to service_role;

comment on schema private is 'Admin-only storage for non-product data such as moderation audit payloads.';

create type public.gender_type as enum (
  'male',
  'female'
);

create type public.concern_source_type as enum (
  'real',
  'example'
);

create type public.concern_delivery_status as enum (
  'assigned',
  'opened',
  'responded'
);

create type public.notification_type as enum (
  'concern_delivered',
  'response_received',
  'response_liked',
  'response_commented'
);

create type public.notification_related_entity_type as enum (
  'concern',
  'concern_delivery',
  'response',
  'response_feedback'
);

create type public.push_platform_type as enum (
  'ios',
  'android'
);

create type private.moderation_subject_type as enum (
  'concern',
  'response',
  'response_feedback_comment'
);

create type private.moderation_approved_entity_type as enum (
  'concern',
  'response',
  'response_feedback'
);

comment on type public.gender_type is 'Closed onboarding vocabulary: male | female.';
comment on type public.concern_source_type is 'Concern source type: real | example.';
comment on type public.concern_delivery_status is 'Delivery state progression: assigned -> opened -> responded.';
comment on type public.notification_type is 'User-facing notification types for MVP.';
comment on type public.notification_related_entity_type is 'Polymorphic notification target kind.';
comment on type public.push_platform_type is 'Supported Expo push platforms in MVP.';
comment on type private.moderation_subject_type is 'Kinds of raw text checked by moderation.';
comment on type private.moderation_approved_entity_type is 'Approved product entities linked from moderation audit rows.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  gender public.gender_type,
  onboarding_completed boolean not null default false,
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_onboarding_requires_gender_chk
    check (not onboarding_completed or gender is not null)
);

comment on table public.profiles is 'Human app users only. Example concern authors do not exist in profiles.';
comment on column public.profiles.onboarding_completed is 'Server-owned flag. Onboarding completion also requires at least one profile_interests row in the onboarding transaction.';

create table public.interests (
  key text primary key,
  label_ko text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.interests is 'Fixed canonical interest vocabulary for onboarding, routing, and OpenAI input assembly.';

create table public.profile_interests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  interest_key text not null references public.interests (key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, interest_key)
);

comment on table public.profile_interests is 'User-selected interests. Post-onboarding edits affect future routing only and do not rewrite historical deliveries.';

create table public.concerns (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type public.concern_source_type not null,
  author_profile_id uuid references public.profiles (id) on delete cascade,
  example_key text unique,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concerns_body_not_blank_chk
    check (char_length(btrim(body)) > 0),
  constraint concerns_source_integrity_chk
    check (
      (source_type = 'real' and author_profile_id is not null and example_key is null)
      or
      (source_type = 'example' and author_profile_id is null and example_key is not null)
    )
);

comment on table public.concerns is 'Approved user-facing concerns only. Blocked raw concern text is stored only in private.moderation_audit_entries.';

create table public.concern_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  concern_id uuid not null references public.concerns (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.concern_delivery_status not null default 'assigned',
  delivered_at timestamptz not null default now(),
  opened_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concern_deliveries_concern_recipient_key
    unique (concern_id, recipient_profile_id),
  constraint concern_deliveries_status_timestamps_chk
    check (
      (status = 'assigned' and opened_at is null and responded_at is null)
      or
      (status = 'opened' and opened_at is not null and responded_at is null)
      or
      (status = 'responded' and opened_at is not null and responded_at is not null)
    ),
  constraint concern_deliveries_timestamp_order_chk
    check (
      (opened_at is null or opened_at >= delivered_at)
      and
      (responded_at is null or responded_at >= opened_at)
    )
);

create table public.responses (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.concern_deliveries (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responses_delivery_id_key unique (delivery_id),
  constraint responses_body_not_blank_chk
    check (char_length(btrim(body)) > 0)
);

comment on table public.responses is 'Approved user-facing responses only. Access is intentionally minimal in MVP: recipient and, for real concerns, the concern author.';

create table public.response_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  concern_author_profile_id uuid not null references public.profiles (id) on delete cascade,
  liked boolean not null,
  comment_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint response_feedback_response_author_key
    unique (response_id, concern_author_profile_id),
  constraint response_feedback_comment_not_blank_chk
    check (comment_body is null or char_length(btrim(comment_body)) > 0)
);

comment on table public.response_feedback is 'Insert-only MVP feedback on real concern responses. Visible only to the underlying real concern author.';

create table public.push_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform public.push_platform_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_expo_push_token_key unique (expo_push_token),
  constraint push_tokens_token_not_blank_chk
    check (char_length(btrim(expo_push_token)) > 0)
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  related_entity_type public.notification_related_entity_type not null,
  related_entity_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.moderation_audit_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_type private.moderation_subject_type not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  raw_submitted_text text not null,
  blocked boolean not null,
  category_summary jsonb not null default '{}'::jsonb,
  raw_provider_payload jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  approved_entity_type private.moderation_approved_entity_type,
  approved_entity_id uuid,
  created_at timestamptz not null default now(),
  constraint moderation_audit_raw_text_not_blank_chk
    check (char_length(btrim(raw_submitted_text)) > 0),
  constraint moderation_audit_approved_link_chk
    check (
      (approved_entity_type is null and approved_entity_id is null)
      or
      (approved_entity_type is not null and approved_entity_id is not null)
    )
);

comment on table private.moderation_audit_entries is 'Admin-only moderation audit storage. Raw submitted text and provider payload must never be copied into user-facing product tables.';

insert into public.interests (key, label_ko)
values
  ('job_search', '취업'),
  ('career_path', '진로'),
  ('study', '학업'),
  ('exam', '시험'),
  ('income', '소득'),
  ('housing', '주거'),
  ('romance', '연애'),
  ('marriage', '결혼'),
  ('parents', '부모'),
  ('children', '자녀'),
  ('depression', '우울'),
  ('anxiety', '불안'),
  ('loneliness', '외로움'),
  ('workplace', '직장'),
  ('work_life_balance', '워라밸'),
  ('appearance', '외모'),
  ('self_esteem', '자존감'),
  ('health', '건강'),
  ('retirement', '노후'),
  ('future', '미래');

create index concern_deliveries_recipient_idx
  on public.concern_deliveries (recipient_profile_id, status, delivered_at desc);

create index concerns_author_idx
  on public.concerns (author_profile_id, created_at desc)
  where source_type = 'real';

create index response_feedback_concern_author_idx
  on public.response_feedback (concern_author_profile_id, created_at desc);

create index push_tokens_profile_idx
  on public.push_tokens (profile_id);

create index notifications_profile_idx
  on public.notifications (profile_id, created_at desc);

create index moderation_audit_actor_idx
  on private.moderation_audit_entries (actor_profile_id, checked_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.prevent_self_delivery()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  concern_author_id uuid;
begin
  select c.author_profile_id
    into concern_author_id
  from public.concerns c
  where c.id = new.concern_id;

  if concern_author_id is not null and concern_author_id = new.recipient_profile_id then
    raise exception using
      errcode = '23514',
      message = 'concern author cannot be the recipient of the same concern delivery';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_real_concern_feedback()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  source_kind public.concern_source_type;
  concern_author_id uuid;
begin
  select c.source_type, c.author_profile_id
    into source_kind, concern_author_id
  from public.responses r
  join public.concern_deliveries d on d.id = r.delivery_id
  join public.concerns c on c.id = d.concern_id
  where r.id = new.response_id;

  if source_kind is null then
    raise exception using
      errcode = '23503',
      message = 'response_feedback must reference an existing response';
  end if;

  if source_kind <> 'real' then
    raise exception using
      errcode = '23514',
      message = 'feedback is allowed only for responses to real concerns';
  end if;

  if concern_author_id is distinct from new.concern_author_profile_id then
    raise exception using
      errcode = '23514',
      message = 'feedback may only be created by the underlying real concern author';
  end if;

  return new;
end;
$$;

create or replace function private.notifications_read_at_only()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.type is distinct from old.type
     or new.related_entity_type is distinct from old.related_entity_type
     or new.related_entity_id is distinct from old.related_entity_id
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      message = 'notifications may only update read_at';
  end if;

  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_concerns_updated_at
before update on public.concerns
for each row execute function public.set_updated_at();

create trigger set_concern_deliveries_updated_at
before update on public.concern_deliveries
for each row execute function public.set_updated_at();

create trigger set_responses_updated_at
before update on public.responses
for each row execute function public.set_updated_at();

create trigger set_response_feedback_updated_at
before update on public.response_feedback
for each row execute function public.set_updated_at();

create trigger set_push_tokens_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

create trigger prevent_self_delivery_before_write
before insert or update on public.concern_deliveries
for each row execute function private.prevent_self_delivery();

create trigger enforce_real_concern_feedback_before_write
before insert or update on public.response_feedback
for each row execute function private.enforce_real_concern_feedback();

create trigger notifications_read_at_only_before_update
before update on public.notifications
for each row execute function private.notifications_read_at_only();

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant select on public.interests to authenticated;
grant select, insert, delete on public.profile_interests to authenticated;
grant select on public.concerns to authenticated;
grant select on public.concern_deliveries to authenticated;
grant select, insert on public.responses to authenticated;
grant select, insert on public.response_feedback to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select, update on public.notifications to authenticated;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all tables in schema private to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all sequences in schema private to service_role;

revoke all on all tables in schema private from anon;
revoke all on all tables in schema private from authenticated;

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.concerns enable row level security;
alter table public.concern_deliveries enable row level security;
alter table public.responses enable row level security;
alter table public.response_feedback enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table private.moderation_audit_entries enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy interests_select_authenticated
on public.interests
for select
to authenticated
using (true);

create policy profile_interests_select_own
on public.profile_interests
for select
to authenticated
using (profile_id = auth.uid());

create policy profile_interests_insert_own
on public.profile_interests
for insert
to authenticated
with check (profile_id = auth.uid());

create policy profile_interests_delete_own
on public.profile_interests
for delete
to authenticated
using (profile_id = auth.uid());

create policy concerns_select_own_real
on public.concerns
for select
to authenticated
using (
  source_type = 'real'
  and author_profile_id = auth.uid()
);

create policy concern_deliveries_select_own
on public.concern_deliveries
for select
to authenticated
using (recipient_profile_id = auth.uid());

create policy responses_select_participant
on public.responses
for select
to authenticated
using (
  exists (
    select 1
    from public.concern_deliveries d
    join public.concerns c on c.id = d.concern_id
    where d.id = responses.delivery_id
      and (
        d.recipient_profile_id = auth.uid()
        or (c.source_type = 'real' and c.author_profile_id = auth.uid())
      )
  )
);

create policy responses_insert_recipient_only
on public.responses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concern_deliveries d
    where d.id = responses.delivery_id
      and d.recipient_profile_id = auth.uid()
  )
);

create policy response_feedback_select_concern_author_only
on public.response_feedback
for select
to authenticated
using (
  concern_author_profile_id = auth.uid()
  and exists (
    select 1
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    where r.id = response_feedback.response_id
      and c.source_type = 'real'
      and c.author_profile_id = auth.uid()
  )
);

create policy response_feedback_insert_concern_author_only
on public.response_feedback
for insert
to authenticated
with check (
  concern_author_profile_id = auth.uid()
  and exists (
    select 1
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    where r.id = response_feedback.response_id
      and c.source_type = 'real'
      and c.author_profile_id = auth.uid()
  )
);

create policy push_tokens_select_own
on public.push_tokens
for select
to authenticated
using (profile_id = auth.uid());

create policy push_tokens_insert_own
on public.push_tokens
for insert
to authenticated
with check (profile_id = auth.uid());

create policy push_tokens_update_own
on public.push_tokens
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy push_tokens_delete_own
on public.push_tokens
for delete
to authenticated
using (profile_id = auth.uid());

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (profile_id = auth.uid());

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());
