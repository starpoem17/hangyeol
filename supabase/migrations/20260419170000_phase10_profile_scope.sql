create or replace function public.get_my_solved_count()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using
      errcode = 'P0001',
      message = 'authenticated user is required',
      detail = 'app_error:profile_solved_count_missing_auth';
  end if;

  return coalesce((
    select count(*)::integer
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    join public.response_feedback rf on rf.response_id = r.id
    where d.recipient_profile_id = v_uid
      and c.source_type = 'real'
      and rf.liked = true
  ), 0);
end;
$$;

create or replace function public.update_my_profile_interests(
  p_interest_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_interest_keys text[];
  v_input_count integer;
  v_valid_count integer;
begin
  if v_uid is null then
    raise exception using
      errcode = 'P0001',
      message = 'authenticated user is required',
      detail = 'app_error:profile_interests_missing_auth';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_uid
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile row does not exist for authenticated user',
      detail = 'app_error:profile_interests_profile_missing';
  end if;

  select coalesce(array_agg(distinct trimmed_key order by trimmed_key), '{}'::text[])
    into v_interest_keys
  from (
    select nullif(btrim(key), '') as trimmed_key
    from unnest(coalesce(p_interest_keys, '{}'::text[])) as key
  ) normalized
  where trimmed_key is not null;

  if coalesce(array_length(v_interest_keys, 1), 0) = 0 then
    raise exception using
      errcode = '22023',
      message = 'at least one interest key is required',
      detail = 'app_error:profile_interests_empty';
  end if;

  select count(*)
    into v_input_count
  from unnest(v_interest_keys) as key;

  select count(*)
    into v_valid_count
  from public.interests
  where key = any (v_interest_keys);

  if v_valid_count <> v_input_count then
    raise exception using
      errcode = '22023',
      message = 'one or more interest keys are invalid',
      detail = 'app_error:profile_interests_invalid';
  end if;

  delete from public.profile_interests
  where profile_id = v_uid;

  insert into public.profile_interests (profile_id, interest_key)
  select v_uid, key
  from unnest(v_interest_keys) as key;
end;
$$;

revoke all on function public.get_my_solved_count() from public;
revoke all on function public.get_my_solved_count() from anon;
grant execute on function public.get_my_solved_count() to authenticated;

revoke all on function public.update_my_profile_interests(text[]) from public;
revoke all on function public.update_my_profile_interests(text[]) from anon;
grant execute on function public.update_my_profile_interests(text[]) to authenticated;
