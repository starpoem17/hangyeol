-- Phase 6: authored concern response listing and response-detail viewing RPCs.

create or replace function public.list_my_concern_responses(p_concern_id uuid)
returns table (
  response_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    r.id as response_id,
    r.body,
    r.created_at
  from public.concerns c
  join public.concern_deliveries d on d.concern_id = c.id
  join public.responses r on r.delivery_id = d.id
  where c.id = p_concern_id
    and c.source_type = 'real'
    and c.author_profile_id = auth.uid()
  order by r.created_at desc, r.id desc;
$$;

comment on function public.list_my_concern_responses(uuid)
  is 'Returns authored real-concern responses without exposing concern_deliveries to the concern author.';

revoke all on function public.list_my_concern_responses(uuid) from public;
revoke all on function public.list_my_concern_responses(uuid) from anon;
grant execute on function public.list_my_concern_responses(uuid) to authenticated;

create or replace function public.get_my_concern_response_detail(p_response_id uuid)
returns table (
  response_id uuid,
  concern_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    r.id as response_id,
    c.id as concern_id,
    r.body,
    r.created_at
  from public.responses r
  join public.concern_deliveries d on d.id = r.delivery_id
  join public.concerns c on c.id = d.concern_id
  where r.id = p_response_id
    and c.source_type = 'real'
    and c.author_profile_id = auth.uid()
  limit 1;
$$;

comment on function public.get_my_concern_response_detail(uuid)
  is 'Returns one authored real-concern response detail plus parent concern id for author-side navigation.';

revoke all on function public.get_my_concern_response_detail(uuid) from public;
revoke all on function public.get_my_concern_response_detail(uuid) from anon;
grant execute on function public.get_my_concern_response_detail(uuid) to authenticated;
