-- Phase 7: allow authored concern feedback rows to be edited by the same concern author.

grant update on public.response_feedback to authenticated;

drop policy if exists response_feedback_update_concern_author_only
on public.response_feedback;

create policy response_feedback_update_concern_author_only
on public.response_feedback
for update
to authenticated
using (
  concern_author_profile_id = auth.uid()
  and exists (
    select 1
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    where r.id = response_feedback.response_id
      and c.source_type = 'real'
      and c.author_profile_id = auth.uid()
  )
)
with check (
  concern_author_profile_id = auth.uid()
  and exists (
    select 1
    from public.responses r
    join public.concern_deliveries d on d.id = r.delivery_id
    join public.concerns c on c.id = d.concern_id
    where r.id = response_feedback.response_id
      and c.source_type = 'real'
      and c.author_profile_id = auth.uid()
  )
);
