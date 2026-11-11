drop function public.provision_staff(uuid,uuid,text,text,boolean,uuid);
create function public.provision_staff(p_user_id uuid,p_gym_id uuid,p_name text,p_role text,p_bootstrap boolean default false,p_actor_id uuid default null,p_currency text default 'TWD') returns uuid
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
 insert into public.gyms(id,name,currency) values(p_gym_id,'KILO 私人訓練',p_currency);
 insert into public.gym_settings(gym_id) values(p_gym_id);
 if p_currency='TWD' then
 insert into public.price_tiers(gym_id,name,unit_price) values(p_gym_id,'標準方案',200000),(p_gym_id,'方案 A',189000),(p_gym_id,'方案 B',175000),(p_gym_id,'方案 C',168000);
 end if;
 end if;
 insert into public.user_profiles(id,gym_id,name,role) values(p_user_id,p_gym_id,p_name,p_role);
 if p_role='coach' then insert into public.coaches(id,gym_id,name) values(p_user_id,p_gym_id,p_name); end if;
 insert into public.audit_logs(gym_id,actor_id,action,record_id,details) values(p_gym_id,coalesce(p_actor_id,p_user_id),case when p_bootstrap then 'bootstrap' else 'staff_invite' end,p_user_id,jsonb_build_object('name',p_name,'role',p_role));
 return p_user_id;
end $$;
revoke all on function public.provision_staff(uuid,uuid,text,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.provision_staff(uuid,uuid,text,text,boolean,uuid,text) to service_role;
