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

  if v_should_notify_liked or v_should_notify_commented then
    return;
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
