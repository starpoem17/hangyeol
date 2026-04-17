create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.complete_onboarding(
  p_gender public.gender_type,
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
      detail = 'app_error:onboarding_missing_auth';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_uid
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile row does not exist for authenticated user',
      detail = 'app_error:onboarding_profile_missing';
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
      detail = 'app_error:onboarding_empty_interests';
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
      detail = 'app_error:onboarding_invalid_interests';
  end if;

  delete from public.profile_interests
  where profile_id = v_uid;

  insert into public.profile_interests (profile_id, interest_key)
  select v_uid, key
  from unnest(v_interest_keys) as key;

  update public.profiles
  set gender = p_gender,
      onboarding_completed = true
  where id = v_uid;
end;
$$;

revoke all on function public.complete_onboarding(public.gender_type, text[]) from public;
revoke all on function public.complete_onboarding(public.gender_type, text[]) from anon;
grant execute on function public.complete_onboarding(public.gender_type, text[]) to authenticated;
