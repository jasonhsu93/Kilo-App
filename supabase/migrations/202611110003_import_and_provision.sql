alter table public.import_batches add column source jsonb not null;
create function private.import_rows(x jsonb,a public.user_profiles) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; prior public.import_batches; c public.customers; p public.packages; gy public.gyms;
 bid uuid; co uuid; pid uuid; aid uuid; eid uuid; q integer; remaining_q integer; price bigint;
begin
 if a.role<>'admin' or a.id<>auth.uid() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if jsonb_typeof(x->'rows')<>'array' or jsonb_array_length(x->'rows') not between 1 and 500 then raise exception 'INVALID_IMPORT'; end if;
 if length(trim(x->>'batch_id')) not between 1 and 100 or x->>'batch_id' is null then raise exception 'INVALID_BATCH'; end if;
 perform 1 from public.gyms where id=a.gym_id for update;
 select * into prior from public.import_batches where gym_id=a.gym_id and external_id=x->>'batch_id';
 if prior.id is not null then
 if prior.source<>x then raise exception 'IMPORT_BATCH_CONFLICT'; end if;
 return jsonb_build_object('id',prior.id,'already_imported',true);
 end if;
 select * into gy from public.gyms where id=a.gym_id;
 insert into public.import_batches(gym_id,external_id,actor_id,row_count,source) values(a.gym_id,x->>'batch_id',a.id,jsonb_array_length(x->'rows'),x) returning id into bid;
 -- Stable customer lock order also coordinates batches with regular commands.
 perform 1 from public.customers where gym_id=a.gym_id order by id for update;
 for r in select value from jsonb_array_elements(x->'rows') order by case value->>'row_type' when 'customer' then 1 when 'opening' then 2 when 'package' then 2 when 'payment' then 3 else 4 end,value->>'external_id' loop
 if length(trim(r->>'external_id')) not between 1 and 100 or r->>'external_id' is null then raise exception 'IMPORT_EXTERNAL_ID_REQUIRED'; end if;
 if r->>'row_type'='customer' then
 insert into public.customers(gym_id,external_id,name,phone,email,notes) values(a.gym_id,r->>'external_id',r->>'name',nullif(r->>'phone',''),nullif(r->>'email',''),r->>'notes') returning * into c;
 if nullif(r->>'coach_id','') is not null then
 co:=(r->>'coach_id')::uuid;
 if not exists(select 1 from public.coaches where id=co and gym_id=a.gym_id and active) then raise exception 'IMPORT_INVALID_COACH'; end if;
 insert into public.customer_coach_assignments(gym_id,customer_id,coach_id) values(a.gym_id,c.id,co);
 end if;
 elsif r->>'row_type' in ('opening','package') then
 select * into c from public.customers where gym_id=a.gym_id and external_id=r->>'customer_external_id';
 if c.id is null or not c.active then raise exception 'IMPORT_CUSTOMER_NOT_FOUND'; end if;
 co:=(r->>'coach_id')::uuid;
 if not exists(select 1 from public.coaches where id=co and gym_id=a.gym_id and active) then raise exception 'IMPORT_INVALID_COACH'; end if;
 q:=(r->>'quantity')::integer; remaining_q:=coalesce(nullif(r->>'remaining','')::integer,q); price:=nullif(r->>'unit_price','')::bigint;
 if remaining_q<0 or remaining_q>q then raise exception 'IMPORT_INVALID_BALANCE'; end if;
 insert into public.packages(gym_id,customer_id,original_coach_id,quantity,unit_price,currency,kind,purchased_at,external_id,reason)
 values(a.gym_id,c.id,co,q,price,gy.currency,'opening',coalesce(nullif(r->>'purchased_at','')::timestamptz,now()),r->>'external_id','CSV opening balance: '||(x->>'batch_id')) returning id into pid;
 insert into public.package_allocations(gym_id,package_id,coach_id) values(a.gym_id,pid,co) returning id into aid;
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,c.id,a.id,'opening','CSV opening balance: '||(x->>'batch_id')) returning id into eid;
 if remaining_q>0 then perform private.entry(a.gym_id,eid,aid,remaining_q); end if;
 insert into public.customer_coach_assignments(gym_id,customer_id,coach_id) values(a.gym_id,c.id,co) on conflict(customer_id,coach_id) do update set active=true;
 elsif r->>'row_type'='payment' then
 select * into p from public.packages where gym_id=a.gym_id and external_id=r->>'package_external_id';
 if p.id is null or p.kind<>'opening' then raise exception 'IMPORT_PACKAGE_NOT_FOUND'; end if;
 select l.event_id into eid from public.credit_ledger_entries l join public.package_allocations pa on pa.id=l.allocation_id where pa.package_id=p.id order by l.created_at limit 1;
 if eid is null then
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,p.customer_id,a.id,'opening','Historical payment reference; no credits added') returning id into eid;
 end if;
 insert into public.payments(gym_id,package_id,event_id,amount,method,paid_at,recorded_by)
 values(a.gym_id,p.id,eid,(r->>'amount')::bigint,r->>'method',(r->>'paid_at')::timestamptz,a.id);
 else raise exception 'IMPORT_INVALID_ROW_TYPE'; end if;
 end loop;
 return jsonb_build_object('id',bid,'rows',jsonb_array_length(x->'rows'));
end $$;
revoke all on function private.import_rows(jsonb,public.user_profiles) from public,anon,authenticated;

-- Service-role-only account provisioning. Application staff cannot call this RPC.
create function public.provision_staff(p_user_id uuid,p_gym_id uuid,p_name text,p_role text,p_bootstrap boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.user_profiles;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then
 raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(721341);
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
 else
 if not exists(select 1 from public.gyms where id=p_gym_id) then raise exception 'GYM_NOT_FOUND'; end if;
 end if;
 insert into public.user_profiles(id,gym_id,name,role) values(p_user_id,p_gym_id,p_name,p_role);
 if p_role='coach' then insert into public.coaches(id,gym_id,name) values(p_user_id,p_gym_id,p_name); end if;
 return p_user_id;
end $$;
revoke all on function public.provision_staff(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.provision_staff(uuid,uuid,text,text,boolean) to service_role;
