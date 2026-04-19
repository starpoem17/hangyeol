-- Phase 10 v3: contract closure for controlled-cohort routing, server-owned reads,
-- moderation operator visibility, and atomic approved concern persistence.

revoke insert on public.responses from authenticated;
drop policy if exists responses_insert_recipient_only on public.responses;

create or replace function private.create_real_concern_deliveries(
  p_concern_id uuid,
  p_recipient_profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_source_type public.concern_source_type;
  v_author_profile_id uuid;
  v_recipient_count integer := coalesce(array_length(p_recipient_profile_ids, 1), 0);
  v_distinct_recipient_count integer;
  v_existing_delivery_count integer;
begin
  if p_concern_id is null then
    raise exception using
      errcode = '23502',
      message = 'concern id is required';
  end if;

  if v_recipient_count < 1 or v_recipient_count > 3 then
    raise exception using
      errcode = '23514',
      message = 'recipient profile id count must be between 1 and 3';
  end if;

  select
    c.source_type,
    c.author_profile_id
  into
    v_source_type,
    v_author_profile_id
  from public.concerns c
  where c.id = p_concern_id;

  if v_source_type is null then
    raise exception using
      errcode = '23503',
      message = 'concern does not exist';
  end if;

  if v_source_type <> 'real' then
    raise exception using
      errcode = '23514',
      message = 'only real concerns may create deliveries';
  end if;

  select count(distinct recipient_profile_id)
    into v_distinct_recipient_count
  from unnest(p_recipient_profile_ids) as recipient_profile_id;

  if v_distinct_recipient_count <> v_recipient_count then
    raise exception using
      errcode = '23514',
      message = 'recipient profile ids must be distinct';
  end if;

  if exists (
    select 1
    from unnest(p_recipient_profile_ids) as recipient_profile_id
    where recipient_profile_id = v_author_profile_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'self-delivery is forbidden';
  end if;

  select count(*)
    into v_existing_delivery_count
  from public.concern_deliveries
  where concern_id = p_concern_id;

  if v_existing_delivery_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'concern deliveries already exist for this concern';
  end if;

  insert into public.concern_deliveries (
    concern_id,
    recipient_profile_id,
    routing_order
  )
  select
    p_concern_id,
    recipient_profile_id,
    routing_order::integer
  from unnest(p_recipient_profile_ids) with ordinality as recipients(recipient_profile_id, routing_order);
end;
$$;

create or replace function public.submit_approved_concern_with_routing_and_notifications(
  p_actor_profile_id uuid,
  p_raw_submitted_text text,
  p_validated_body text,
  p_category_summary jsonb default '{}'::jsonb,
  p_raw_provider_payload jsonb default '{}'::jsonb,
  p_recipient_profile_ids uuid[]
)
returns table (
  concern_id uuid,
  delivery_id uuid,
  recipient_profile_id uuid,
  routing_order integer,
  notification_id uuid,
  notification_profile_id uuid,
  notification_type public.notification_type,
  notification_related_entity_type public.notification_related_entity_type,
  notification_related_entity_id uuid
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_concern_id uuid;
  v_recipient_count integer := coalesce(array_length(p_recipient_profile_ids, 1), 0);
  v_distinct_recipient_count integer;
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

  if p_validated_body is null or char_length(btrim(p_validated_body)) = 0 then
    raise exception using
      errcode = '23514',
      message = 'approved concern submissions require a validated concern body';
  end if;

  if v_recipient_count <> 3 then
    raise exception using
      errcode = '23514',
      message = 'approved concern submissions require exactly 3 recipient profile ids';
  end if;

  select count(distinct recipient_profile_id)
    into v_distinct_recipient_count
  from unnest(p_recipient_profile_ids) as recipient_profile_id;

  if v_distinct_recipient_count <> 3 then
    raise exception using
      errcode = '23514',
      message = 'recipient profile ids must be distinct';
  end if;

  if exists (
    select 1
    from unnest(p_recipient_profile_ids) as recipient_profile_id
    where recipient_profile_id = p_actor_profile_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'self-delivery is forbidden';
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

  perform private.create_real_concern_deliveries(
    v_concern_id,
    p_recipient_profile_ids
  );

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

  return query
  with inserted_deliveries as (
    select
      d.id as delivery_id,
      d.recipient_profile_id,
      d.routing_order
    from public.concern_deliveries d
    where d.concern_id = v_concern_id
  ),
  inserted_notifications as (
    insert into public.notifications (
      profile_id,
      type,
      related_entity_type,
      related_entity_id
    )
    select
      d.recipient_profile_id,
      'concern_delivered'::public.notification_type,
      'concern_delivery'::public.notification_related_entity_type,
      d.delivery_id
    from inserted_deliveries d
    order by d.routing_order
    returning
      id,
      profile_id,
      type,
      related_entity_type,
      related_entity_id
  )
  select
    v_concern_id,
    d.delivery_id,
    d.recipient_profile_id,
    d.routing_order,
    n.id,
    n.profile_id,
    n.type,
    n.related_entity_type,
    n.related_entity_id
  from inserted_deliveries d
  join inserted_notifications n
    on n.profile_id = d.recipient_profile_id
   and n.related_entity_id = d.delivery_id
  order by d.routing_order;
end;
$$;

comment on function public.submit_approved_concern_with_routing_and_notifications(uuid, text, text, jsonb, jsonb, uuid[])
  is 'Service-role-only helper that atomically persists an approved real concern, its linked moderation audit row, its three deliveries, and concern_delivered notifications.';

revoke all on function public.submit_approved_concern_with_routing_and_notifications(uuid, text, text, jsonb, jsonb, uuid[]) from public;
revoke all on function public.submit_approved_concern_with_routing_and_notifications(uuid, text, text, jsonb, jsonb, uuid[]) from anon;
revoke all on function public.submit_approved_concern_with_routing_and_notifications(uuid, text, text, jsonb, jsonb, uuid[]) from authenticated;
grant execute on function public.submit_approved_concern_with_routing_and_notifications(uuid, text, text, jsonb, jsonb, uuid[]) to service_role;

create or replace function public.submit_response_with_notifications_and_moderation_audit(
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
  notification_created boolean,
  concern_source_type public.concern_source_type,
  notification_id uuid,
  notification_profile_id uuid,
  notification_type public.notification_type,
  notification_related_entity_type public.notification_related_entity_type,
  notification_related_entity_id uuid
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
  v_notification_id uuid := null;
  v_notification_profile_id uuid := null;
  v_notification_type public.notification_type := null;
  v_notification_related_entity_type public.notification_related_entity_type := null;
  v_notification_related_entity_id uuid := null;
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
    select
      null::uuid,
      'delivery_not_accessible'::text,
      false,
      null::public.concern_source_type,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
    return;
  end if;

  if v_delivery_status = 'responded' then
    return query
    select
      null::uuid,
      'delivery_already_responded'::text,
      false,
      v_concern_source_type,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
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
    select
      null::uuid,
      'blocked'::text,
      false,
      v_concern_source_type,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
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
      select
        null::uuid,
        'delivery_already_responded'::text,
        false,
        v_concern_source_type,
        null::uuid,
        null::uuid,
        null::public.notification_type,
        null::public.notification_related_entity_type,
        null::uuid;
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
    )
    returning
      id,
      profile_id,
      type,
      related_entity_type,
      related_entity_id
    into
      v_notification_id,
      v_notification_profile_id,
      v_notification_type,
      v_notification_related_entity_type,
      v_notification_related_entity_id;

    v_notification_created := true;
  end if;

  return query
  select
    v_response_id,
    'approved'::text,
    v_notification_created,
    v_concern_source_type,
    v_notification_id,
    v_notification_profile_id,
    v_notification_type,
    v_notification_related_entity_type,
    v_notification_related_entity_id;
end;
$$;

create or replace function public.get_profile_solved_count_for_service(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_profile_id is null then
    raise exception using
      errcode = '23502',
      message = 'profile id is required';
  end if;

  return coalesce((
    select count(*)::integer
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    join public.response_feedback rf on rf.response_id = r.id
    where d.recipient_profile_id = p_profile_id
      and c.source_type = 'real'
      and rf.liked = true
  ), 0);
end;
$$;

comment on function public.get_profile_solved_count_for_service(uuid)
  is 'Service-role-only solved-count helper. The app reads solved count only through the get-profile-summary Edge Function.';

revoke all on function public.get_my_solved_count() from public;
revoke all on function public.get_my_solved_count() from anon;
revoke all on function public.get_my_solved_count() from authenticated;

revoke all on function public.get_profile_solved_count_for_service(uuid) from public;
revoke all on function public.get_profile_solved_count_for_service(uuid) from anon;
revoke all on function public.get_profile_solved_count_for_service(uuid) from authenticated;
grant execute on function public.get_profile_solved_count_for_service(uuid) to service_role;

create or replace function public.list_moderation_audit_entries_for_operator(
  p_limit integer default 20,
  p_subject_type private.moderation_subject_type default null,
  p_blocked boolean default null
)
returns table (
  checked_at timestamptz,
  subject_type private.moderation_subject_type,
  actor_profile_id uuid,
  blocked boolean,
  approved_entity_type private.moderation_approved_entity_type,
  approved_entity_id uuid,
  category_summary jsonb,
  raw_submitted_text text,
  has_raw_provider_payload boolean,
  raw_provider_payload jsonb
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select
    e.checked_at,
    e.subject_type,
    e.actor_profile_id,
    e.blocked,
    e.approved_entity_type,
    e.approved_entity_id,
    e.category_summary,
    e.raw_submitted_text,
    coalesce(e.raw_provider_payload, '{}'::jsonb) <> '{}'::jsonb as has_raw_provider_payload,
    e.raw_provider_payload
  from private.moderation_audit_entries e
  where (p_subject_type is null or e.subject_type = p_subject_type)
    and (p_blocked is null or e.blocked = p_blocked)
  order by e.checked_at desc, e.id desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

comment on function public.list_moderation_audit_entries_for_operator(integer, private.moderation_subject_type, boolean)
  is 'Service-role-only operator view over moderation audit entries for recent listing plus simple filters.';

revoke all on function public.list_moderation_audit_entries_for_operator(integer, private.moderation_subject_type, boolean) from public;
revoke all on function public.list_moderation_audit_entries_for_operator(integer, private.moderation_subject_type, boolean) from anon;
revoke all on function public.list_moderation_audit_entries_for_operator(integer, private.moderation_subject_type, boolean) from authenticated;
grant execute on function public.list_moderation_audit_entries_for_operator(integer, private.moderation_subject_type, boolean) to service_role;
