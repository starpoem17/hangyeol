-- Phase 3: concern submission moderation and audit persistence.
-- This helper lives in public because the current Supabase API exposure includes
-- public/storage/graphql_public only. Keeping private out of api.schemas preserves
-- the stronger private-schema boundary for audit tables, while EXECUTE stays
-- restricted to service_role so normal clients cannot call this path.

create or replace function public.submit_concern_with_moderation_audit(
  p_actor_profile_id uuid,
  p_raw_submitted_text text,
  p_validated_body text,
  p_blocked boolean,
  p_category_summary jsonb default '{}'::jsonb,
  p_raw_provider_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_concern_id uuid;
begin
  if p_actor_profile_id is null then
    raise exception using
      errcode = '23502',
      message = 'actor profile id is required';
  end if;

  if p_raw_submitted_text is null or char_length(btrim(p_raw_submitted_text)) = 0 then
    raise exception using
      errcode = '23514',
      message = 'raw submitted text must not be blank';
  end if;

  if p_blocked then
    if p_validated_body is not null then
      raise exception using
        errcode = '23514',
        message = 'blocked concern submissions must not include an approved concern body';
    end if;

    insert into private.moderation_audit_entries (
      subject_type,
      actor_profile_id,
      raw_submitted_text,
      blocked,
      category_summary,
      raw_provider_payload
    )
    values (
      'concern',
      p_actor_profile_id,
      p_raw_submitted_text,
      true,
      coalesce(p_category_summary, '{}'::jsonb),
      coalesce(p_raw_provider_payload, '{}'::jsonb)
    );

    return null;
  end if;

  if p_validated_body is null or char_length(btrim(p_validated_body)) = 0 then
    raise exception using
      errcode = '23514',
      message = 'approved concern submissions require a validated concern body';
  end if;

  insert into public.concerns (
    source_type,
    author_profile_id,
    body
  )
  values (
    'real',
    p_actor_profile_id,
    btrim(p_validated_body)
  )
  returning id into v_concern_id;

  insert into private.moderation_audit_entries (
    subject_type,
    actor_profile_id,
    raw_submitted_text,
    blocked,
    category_summary,
    raw_provider_payload,
    approved_entity_type,
    approved_entity_id
  )
  values (
    'concern',
    p_actor_profile_id,
    p_raw_submitted_text,
    false,
    coalesce(p_category_summary, '{}'::jsonb),
    coalesce(p_raw_provider_payload, '{}'::jsonb),
    'concern',
    v_concern_id
  );

  return v_concern_id;
end;
$$;

comment on function public.submit_concern_with_moderation_audit(uuid, text, text, boolean, jsonb, jsonb)
  is 'Service-role-only helper for approved-vs-blocked concern submission persistence. Public schema is used only because current Supabase RPC exposure excludes private.';

revoke all on function public.submit_concern_with_moderation_audit(uuid, text, text, boolean, jsonb, jsonb) from public;
revoke all on function public.submit_concern_with_moderation_audit(uuid, text, text, boolean, jsonb, jsonb) from anon;
revoke all on function public.submit_concern_with_moderation_audit(uuid, text, text, boolean, jsonb, jsonb) from authenticated;
grant execute on function public.submit_concern_with_moderation_audit(uuid, text, text, boolean, jsonb, jsonb) to service_role;
