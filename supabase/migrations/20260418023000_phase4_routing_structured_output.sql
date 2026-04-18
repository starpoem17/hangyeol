alter table public.concern_deliveries
add column routing_order integer;

with ranked_deliveries as (
  select
    id,
    row_number() over (
      partition by concern_id
      order by delivered_at asc, created_at asc, id asc
    ) as routing_order
  from public.concern_deliveries
)
update public.concern_deliveries as concern_deliveries
set routing_order = ranked_deliveries.routing_order
from ranked_deliveries
where concern_deliveries.id = ranked_deliveries.id
  and concern_deliveries.routing_order is null;

alter table public.concern_deliveries
alter column routing_order set not null;

alter table public.concern_deliveries
add constraint concern_deliveries_routing_order_chk
  check (routing_order > 0);

alter table public.concern_deliveries
add constraint concern_deliveries_concern_routing_order_key
  unique (concern_id, routing_order);

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

  select c.source_type
    into v_source_type
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

revoke all on function private.create_real_concern_deliveries(uuid, uuid[]) from public;
revoke all on function private.create_real_concern_deliveries(uuid, uuid[]) from anon;
revoke all on function private.create_real_concern_deliveries(uuid, uuid[]) from authenticated;

create or replace function public.route_concern_atomic_write(
  p_concern_id uuid,
  p_recipient_profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.create_real_concern_deliveries(
    p_concern_id,
    p_recipient_profile_ids
  );
end;
$$;

comment on function public.route_concern_atomic_write(uuid, uuid[])
  is 'Service-role-only wrapper around private.create_real_concern_deliveries. The wrapper exists because current Supabase api.schemas exposure is limited to public.';

revoke all on function public.route_concern_atomic_write(uuid, uuid[]) from public;
revoke all on function public.route_concern_atomic_write(uuid, uuid[]) from anon;
revoke all on function public.route_concern_atomic_write(uuid, uuid[]) from authenticated;
grant execute on function public.route_concern_atomic_write(uuid, uuid[]) to service_role;
