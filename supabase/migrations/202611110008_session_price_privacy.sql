-- A substitute can see their delivered session, but not its owner's unit prices.
drop policy session_allocation_read on public.session_allocations;
create policy session_allocation_read on public.session_allocations for select to authenticated using(
 exists(select 1 from public.sessions s where s.id=session_id and (private.is_admin(s.gym_id) or s.owning_coach_id=auth.uid()))
);
