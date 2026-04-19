-- Phase 8: notifications and push.

alter table public.push_tokens
add constraint push_tokens_profile_platform_key
  unique (profile_id, platform);

create or replace function public.sync_my_push_token(
  p_expo_push_token text,
  p_platform public.push_platform_type
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_normalized_token text := nullif(btrim(coalesce(p_expo_push_token, '')), '');
begin
  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'authenticated user is required';
  end if;

  if p_platform is null then
    raise exception using
      errcode = '23502',
      message = 'platform is required';
  end if;

  if v_normalized_token is null then
    delete from public.push_tokens
    where profile_id = v_actor_profile_id
      and platform = p_platform;

    return;
  end if;

  delete from public.push_tokens
  where profile_id = v_actor_profile_id
    and platform = p_platform;

  insert into public.push_tokens (
    profile_id,
    expo_push_token,
    platform
  )
  values (
    v_actor_profile_id,
    v_normalized_token,
    p_platform
  )
  on conflict (expo_push_token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform;
end;
$$;

comment on function public.sync_my_push_token(text, public.push_platform_type)
  is 'Authenticated self-service push token sync. Blank or null tokens clear the caller-owned row for that platform.';

revoke all on function public.sync_my_push_token(text, public.push_platform_type) from public;
revoke all on function public.sync_my_push_token(text, public.push_platform_type) from anon;
grant execute on function public.sync_my_push_token(text, public.push_platform_type) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  update public.notifications
  set read_at = now()
  where id = p_notification_id
    and read_at is null;

  return found;
end;
$$;

comment on function public.mark_notification_read(uuid)
  is 'Marks one caller-owned notification as read using the database clock. Returns true only when unread -> read changed in this call.';

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.route_concern_with_notifications_atomic_write(
  p_concern_id uuid,
  p_recipient_profile_ids uuid[]
)
returns table (
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
begin
  perform private.create_real_concern_deliveries(
    p_concern_id,
    p_recipient_profile_ids
  );

  return query
  with inserted_deliveries as (
    select
      d.id as delivery_id,
      d.recipient_profile_id,
      d.routing_order
    from public.concern_deliveries d
    where d.concern_id = p_concern_id
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

comment on function public.route_concern_with_notifications_atomic_write(uuid, uuid[])
  is 'Service-role-only wrapper that atomically creates real concern deliveries and their in-app concern_delivered notifications.';

revoke all on function public.route_concern_with_notifications_atomic_write(uuid, uuid[]) from public;
revoke all on function public.route_concern_with_notifications_atomic_write(uuid, uuid[]) from anon;
revoke all on function public.route_concern_with_notifications_atomic_write(uuid, uuid[]) from authenticated;
grant execute on function public.route_concern_with_notifications_atomic_write(uuid, uuid[]) to service_role;

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
    v_notification_id,
    v_notification_profile_id,
    v_notification_type,
    v_notification_related_entity_type,
    v_notification_related_entity_id;
end;
$$;

comment on function public.submit_response_with_notifications_and_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb)
  is 'Service-role-only helper for blocked-vs-approved response submission persistence with atomic response, moderation audit, and notification writes.';

revoke all on function public.submit_response_with_notifications_and_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from public;
revoke all on function public.submit_response_with_notifications_and_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from anon;
revoke all on function public.submit_response_with_notifications_and_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) from authenticated;
grant execute on function public.submit_response_with_notifications_and_moderation_audit(uuid, uuid, text, text, boolean, jsonb, jsonb) to service_role;

create or replace function public.save_response_feedback_with_notifications(
  p_actor_profile_id uuid,
  p_response_id uuid,
  p_liked boolean,
  p_comment_body text
)
returns table (
  feedback_id uuid,
  result_code text,
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
  v_concern_source_type public.concern_source_type;
  v_concern_author_profile_id uuid;
  v_delivery_id uuid;
  v_response_author_profile_id uuid;
  v_existing_feedback_id uuid;
  v_existing_liked boolean;
  v_existing_comment_body text;
  v_new_comment_body text := nullif(btrim(coalesce(p_comment_body, '')), '');
  v_should_notify_liked boolean := false;
  v_should_notify_commented boolean := false;
  v_saved_feedback_id uuid;
  v_notification_id uuid;
  v_notification_profile_id uuid;
  v_notification_type public.notification_type;
  v_notification_related_entity_type public.notification_related_entity_type;
  v_notification_related_entity_id uuid;
begin
  if p_actor_profile_id is null then
    raise exception using
      errcode = '23502',
      message = 'actor profile id is required';
  end if;

  if p_response_id is null then
    raise exception using
      errcode = '23502',
      message = 'response id is required';
  end if;

  if p_liked is null then
    raise exception using
      errcode = '23502',
      message = 'liked is required';
  end if;

  select
    c.source_type,
    c.author_profile_id,
    r.delivery_id,
    d.recipient_profile_id
  into
    v_concern_source_type,
    v_concern_author_profile_id,
    v_delivery_id,
    v_response_author_profile_id
  from public.responses r
  join public.concern_deliveries d on d.id = r.delivery_id
  join public.concerns c on c.id = d.concern_id
  where r.id = p_response_id;

  if v_delivery_id is null then
    return query
    select
      null::uuid,
      'response_not_accessible'::text,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
    return;
  end if;

  if v_concern_source_type = 'example' then
    return query
    select
      null::uuid,
      'example_concern_not_allowed'::text,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
    return;
  end if;

  if v_concern_author_profile_id is distinct from p_actor_profile_id then
    return query
    select
      null::uuid,
      'response_not_accessible'::text,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
    return;
  end if;

  select
    rf.id,
    rf.liked,
    rf.comment_body
  into
    v_existing_feedback_id,
    v_existing_liked,
    v_existing_comment_body
  from public.response_feedback rf
  where rf.response_id = p_response_id
    and rf.concern_author_profile_id = p_actor_profile_id;

  if v_existing_feedback_id is not null
     and v_existing_liked is not distinct from p_liked
     and nullif(btrim(coalesce(v_existing_comment_body, '')), '') is not distinct from v_new_comment_body then
    return query
    select
      v_existing_feedback_id,
      'no_op'::text,
      null::uuid,
      null::uuid,
      null::public.notification_type,
      null::public.notification_related_entity_type,
      null::uuid;
    return;
  end if;

  v_should_notify_liked := coalesce(v_existing_liked, false) = false and p_liked = true;
  v_should_notify_commented :=
    nullif(btrim(coalesce(v_existing_comment_body, '')), '') is null
    and v_new_comment_body is not null;

  insert into public.response_feedback (
    response_id,
    concern_author_profile_id,
    liked,
    comment_body
  )
  values (
    p_response_id,
    p_actor_profile_id,
    p_liked,
    v_new_comment_body
  )
  on conflict (response_id, concern_author_profile_id) do update
    set liked = excluded.liked,
        comment_body = excluded.comment_body
  returning id into v_saved_feedback_id;

  if v_should_notify_liked then
    insert into public.notifications (
      profile_id,
      type,
      related_entity_type,
      related_entity_id
    )
    values (
      v_response_author_profile_id,
      'response_liked',
      'concern_delivery',
      v_delivery_id
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

    return query
    select
      v_saved_feedback_id,
      'saved'::text,
      v_notification_id,
      v_notification_profile_id,
      v_notification_type,
      v_notification_related_entity_type,
      v_notification_related_entity_id;
  end if;

  if v_should_notify_commented then
    insert into public.notifications (
      profile_id,
      type,
      related_entity_type,
      related_entity_id
    )
    values (
      v_response_author_profile_id,
      'response_commented',
      'concern_delivery',
      v_delivery_id
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

    return query
    select
      v_saved_feedback_id,
      'saved'::text,
      v_notification_id,
      v_notification_profile_id,
      v_notification_type,
      v_notification_related_entity_type,
      v_notification_related_entity_id;
  end if;

  return query
  select
    v_saved_feedback_id,
    'saved'::text,
    null::uuid,
    null::uuid,
    null::public.notification_type,
    null::public.notification_related_entity_type,
    null::uuid;
end;
$$;

comment on function public.save_response_feedback_with_notifications(uuid, uuid, boolean, text)
  is 'Service-role-only helper for feedback saves with one-time response_liked and response_commented notification emission.';

revoke all on function public.save_response_feedback_with_notifications(uuid, uuid, boolean, text) from public;
revoke all on function public.save_response_feedback_with_notifications(uuid, uuid, boolean, text) from anon;
revoke all on function public.save_response_feedback_with_notifications(uuid, uuid, boolean, text) from authenticated;
grant execute on function public.save_response_feedback_with_notifications(uuid, uuid, boolean, text) to service_role;

create or replace function public.get_my_response_feedback_for_delivery(p_delivery_id uuid)
returns table (
  response_id uuid,
  liked boolean,
  comment_body text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    rf.response_id,
    rf.liked,
    rf.comment_body
  from public.concern_deliveries d
  join public.concerns c on c.id = d.concern_id
  join public.responses r on r.delivery_id = d.id
  join public.response_feedback rf
    on rf.response_id = r.id
   and rf.concern_author_profile_id = c.author_profile_id
  where d.id = p_delivery_id
    and d.recipient_profile_id = auth.uid()
    and c.source_type = 'real'
  limit 1;
$$;

comment on function public.get_my_response_feedback_for_delivery(uuid)
  is 'Recipient-side read helper for real-concern feedback on a response tied to one delivery.';

revoke all on function public.get_my_response_feedback_for_delivery(uuid) from public;
revoke all on function public.get_my_response_feedback_for_delivery(uuid) from anon;
grant execute on function public.get_my_response_feedback_for_delivery(uuid) to authenticated;
