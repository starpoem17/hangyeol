-- Phase 9: example concern supply for Inbox.

with seeded_examples (example_key, body) as (
  values
    (
      'example_job_direction',
      '취업 준비를 오래 하고 있는데 갈수록 제가 어떤 일을 해야 맞는 사람인지 더 모르겠어요. 주변은 빨리 지원하라고 하는데 방향을 못 정해서 마음이 조급해져요.'
    ),
    (
      'example_workplace_loneliness',
      '회사에서는 늘 괜찮은 척하는데 퇴근하고 나면 하루 종일 누구와도 제대로 연결되지 못한 느낌이 들어요. 이 감정을 어떻게 다뤄야 할지 모르겠어요.'
    ),
    (
      'example_family_pressure',
      '부모님 기대를 계속 맞추다 보니 제 선택을 하면 괜히 이기적인 사람이 되는 것 같아요. 독립적으로 결정하려면 어디서부터 정리해야 할까요?'
    ),
    (
      'example_exam_burnout',
      '시험이 다가올수록 책상 앞에는 앉아 있는데 머리에 하나도 안 들어와요. 쉬면 불안하고 계속 붙잡고 있으면 더 지치는 상태가 반복돼요.'
    ),
    (
      'example_relationship_confusion',
      '좋아하는 사람과 연락은 이어가고 있는데 제가 너무 눈치를 보는 것 같아요. 마음을 표현하고 싶지만 관계가 어색해질까 봐 자꾸 망설이게 돼요.'
    ),
    (
      'example_self_esteem',
      '사소한 실수 하나만 해도 하루 종일 제 자신을 심하게 몰아붙이게 돼요. 자존감을 회복하려고 해도 금방 다시 같은 생각으로 돌아옵니다.'
    )
)
insert into public.concerns (
  source_type,
  author_profile_id,
  example_key,
  body
)
select
  'example'::public.concern_source_type,
  null::uuid,
  seeded_examples.example_key,
  seeded_examples.body
from seeded_examples
on conflict (example_key) do update
  set body = excluded.body,
      updated_at = now();

create or replace function public.ensure_example_inbox_supply(
  p_target_visible_count integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_real_active_count integer := 0;
  v_example_active_count integer := 0;
  v_missing_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'authenticated user is required';
  end if;

  if p_target_visible_count is null or p_target_visible_count < 0 then
    raise exception using
      errcode = '22023',
      message = 'target visible count must be zero or greater';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor_profile_id
      and onboarding_completed = true
      and is_active = true
      and is_blocked = false
  ) then
    return 0;
  end if;

  select count(*)
    into v_real_active_count
  from public.concern_deliveries d
  join public.concerns c on c.id = d.concern_id
  where d.recipient_profile_id = v_actor_profile_id
    and d.status in ('assigned', 'opened')
    and c.source_type = 'real';

  select count(*)
    into v_example_active_count
  from public.concern_deliveries d
  join public.concerns c on c.id = d.concern_id
  where d.recipient_profile_id = v_actor_profile_id
    and d.status in ('assigned', 'opened')
    and c.source_type = 'example';

  v_missing_count := greatest(p_target_visible_count - v_real_active_count - v_example_active_count, 0);

  if v_missing_count = 0 then
    return 0;
  end if;

  with candidate_examples as (
    select
      c.id
    from public.concerns c
    where c.source_type = 'example'
      and not exists (
        select 1
        from public.concern_deliveries existing
        where existing.concern_id = c.id
          and existing.recipient_profile_id = v_actor_profile_id
      )
    order by c.created_at asc, c.id asc
    limit v_missing_count
    for update of c skip locked
  ),
  inserted as (
    insert into public.concern_deliveries (
      concern_id,
      recipient_profile_id,
      routing_order
    )
    select
      candidate_examples.id,
      v_actor_profile_id,
      coalesce((
        select max(existing.routing_order)
        from public.concern_deliveries existing
        where existing.concern_id = candidate_examples.id
      ), 0) + 1
    from candidate_examples
    returning id
  )
  select count(*)
    into v_inserted_count
  from inserted;

  return v_inserted_count;
end;
$$;

comment on function public.ensure_example_inbox_supply(integer)
  is 'Ensures the caller has enough active example concern deliveries to backfill the Inbox when real deliveries are insufficient.';

revoke all on function public.ensure_example_inbox_supply(integer) from public;
revoke all on function public.ensure_example_inbox_supply(integer) from anon;
grant execute on function public.ensure_example_inbox_supply(integer) to authenticated;
