-- Substitute instructors get a scoped read model, never private customer notes
-- or package prices. Historical sessions already carry a minimal name snapshot.
create or replace function private.can_customer(g uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(g) and (private.is_admin(g) or private.assigned(g,c,auth.uid()))
$$;
create view public.substitution_context with (security_barrier=true) as
 select s.id,s.customer_id,c.name as customer_name,c.active,
 coalesce((select sum(pa.balance) from public.package_allocations pa join public.packages p on p.id=pa.package_id
 where p.customer_id=s.customer_id and pa.coach_id=s.owning_coach_id),0)::integer as owning_balance
 from public.substitution_authorizations s join public.customers c on c.id=s.customer_id
 where private.member(s.gym_id) and (private.is_admin(s.gym_id) or (s.teaching_coach_id=auth.uid() and s.consumed<s.quantity));
revoke all on public.substitution_context from public,anon;
grant select on public.substitution_context to authenticated;
-- Provisioning identity and its audit entry commit together. The initiating admin
-- is revalidated in the database after the Auth API call.
drop function public.provision_staff(uuid,uuid,text,text,boolean);
create function public.provision_staff(p_user_id uuid,p_gym_id uuid,p_name text,p_role text,p_bootstrap boolean default false,p_actor_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.user_profiles;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then
 raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(721341);
 if not p_bootstrap and not exists(select 1 from public.user_profiles where id=p_actor_id and gym_id=p_gym_id and role='admin' and active) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into existing from public.user_profiles where id=p_user_id;
 if existing.id is not null then
 if existing.gym_id<>p_gym_id or existing.role<>p_role then raise exception 'STAFF_PROVISION_CONFLICT'; end if;
 return existing.id;
 end if;
 if p_bootstrap then
 if exists(select 1 from public.user_profiles where role='admin') or p_role<>'admin' then raise exception 'BOOTSTRAP_ALREADY_COMPLETED'; end if;
 insert into public.gyms(id,name) values(p_gym_id,'KILO 私人訓練');
 insert into public.gym_settings(gym_id) values(p_gym_id);
 insert into public.price_tiers(gym_id,name,unit_price) values(p_gym_id,'標準方案',200000),(p_gym_id,'方案 A',189000),(p_gym_id,'方案 B',175000),(p_gym_id,'方案 C',168000);
 end if;
 insert into public.user_profiles(id,gym_id,name,role) values(p_user_id,p_gym_id,p_name,p_role);
 if p_role='coach' then insert into public.coaches(id,gym_id,name) values(p_user_id,p_gym_id,p_name); end if;
 insert into public.audit_logs(gym_id,actor_id,action,record_id,details) values(p_gym_id,coalesce(p_actor_id,p_user_id),case when p_bootstrap then 'bootstrap' else 'staff_invite' end,p_user_id,jsonb_build_object('name',p_name,'role',p_role));
 return p_user_id;
end $$;
revoke all on function public.provision_staff(uuid,uuid,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.provision_staff(uuid,uuid,text,text,boolean,uuid) to service_role;
