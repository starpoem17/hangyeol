-- Step 5: inbox recipient read access, mark-open RPC, and atomic response persistence.

create policy concerns_select_assigned_recipient
on public.concerns
for select
to authenticated
using (
  exists (
    select 1
    from public.concern_deliveries d
    where d.concern_id = concerns.id
      and d.recipient_profile_id = auth.uid()
  )
);

create or replace function public.mark_concern_delivery_opened(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_transitioned_count bigint := 0;
begin
  update public.concern_deliveries
  set
    status = 'opened',
    opened_at = now()
  where id = p_delivery_id
    and recipient_profile_id = auth.uid()
    and status = 'assigned';

  get diagnostics v_transitioned_count = row_count;

  return coalesce(v_transitioned_count, 0) > 0;
end;
$$;

comment on function public.mark_concern_delivery_opened(uuid)
  is 'Recipient-owned assigned -> opened transition. Returns true only when the delivery was changed by this call.';

revoke all on function public.mark_concern_delivery_opened(uuid) from public;
revoke all on function public.mark_concern_delivery_opened(uuid) from anon;
grant execute on function public.mark_concern_delivery_opened(uuid) to authenticated;

create or replace function public.submit_response_with_moderation_audit(
  p_actor_profile_id uuid,
  p_delivery_id uuid,
  p_raw_submitted_text text,
  p_validated_body text,
  p_blocked boolean,
  p_category_summary jsonb default '{}'::jsonb,
  p_raw_provider_payload jsonb default '{}'::jsonb
)
returns table (
  response_id uuid,
  result_code text,
  notification_created boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_delivery_status public.concern_delivery_status;
  v_concern_id uuid;
  v_concern_source_type public.concern_source_type;
  v_concern_author_profile_id uuid;
  v_response_id uuid;
  v_notification_created boolean := false;
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

  select
    d.status,
    d.concern_id,
    c.source_type,
    c.author_profile_id
  into
    v_delivery_status,
    v_concern_id,
    v_concern_source_type,
    v_concern_author_profile_id
  from public.concern_deliveries d
  join public.concerns c on c.id = d.concern_id
  where d.id = p_delivery_id
    and d.recipient_profile_id = p_actor_profile_id;

  if v_concern_id is null then
    return query
    select null::uuid, 'delivery_not_accessible'::text, false;
    return;
  end if;

  if v_delivery_status = 'responded' then
    return query
    select null::uuid, 'delivery_already_responded'::text, false;
    return;
  end if;

  if p_blocked then
    if p_validated_body is not null then
      raise exception using
        errcode = '23514',
        message = 'blocked response submissions must not include an approved response body';
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
      'response',
      p_actor_profile_id,
      p_raw_submitted_text,
      true,
      coalesce(p_category_summary, '{}'::jsonb),
      coalesce(p_raw_provider_payload, '{}'::jsonb)
    );

    return query
    select null::uuid, 'blocked'::text, false;
    return;
  end if;

  if p_validated_body is null or char_length(btrim(p_validated_body)) = 0 then
    raise exception using
      errcode = '23514',
      message = 'approved response submissions require a validated response body';
  end if;

  begin
    insert into public.responses (
      delivery_id,
      body
    )
    values (
      p_delivery_id,
      btrim(p_validated_body)
    )
    returning id into v_response_id;
  exception
    when unique_violation then
      return query
      select null::uuid, 'delivery_already_responded'::text, false;
      return;
  end;

  update public.concern_deliveries
  set
    status = 'responded',
    opened_at = coalesce(opened_at, now()),
    responded_at = now()
  where id = p_delivery_id
    and recipient_profile_id = p_actor_profile_id
    and status in ('assigned', 'opened');

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
    'response',
    p_actor_profile_id,
    p_raw_submitted_text,
    false,
    coalesce(p_category_summary, '{}'::jsonb),
    coalesce(p_raw_provider_payload, '{}'::jsonb),
    'response',
    v_response_id
  );

  if v_concern_source_type = 'real' and v_concern_author_profile_id is not null then
    insert into public.notifications (
      profile_id,
      type,
      related_entity_type,
      related_entity_id
    )
    values (
      v_concern_author_profile_id,
      'response_received',
      'response',
      v_response_id
    );

    v_notification_created := true;
  end if;

  return query
  select v_response_id, 'approved'::text, v_notification_created;
end;
$$;

comment on function public.submit_response_with_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb)
  is 'Service-role-only helper for blocked-vs-approved response submission persistence with atomic delivery and notification writes.';

revoke all on function public.submit_response_with_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from public;
revoke all on function public.submit_response_with_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from anon;
revoke all on function public.submit_response_with_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from authenticated;
grant execute on function public.submit_response_with_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) to service_role;
