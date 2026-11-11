create function private.entry(g uuid,e uuid,a uuid,d integer) returns integer language plpgsql security definer set search_path='' as $$
declare b integer;
begin
 update public.package_allocations set balance=balance+d where id=a and gym_id=g and balance+d>=0 returning balance into b;
 if b is null then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.credit_ledger_entries(gym_id,event_id,allocation_id,delta,balance_after) values(g,e,a,d,b);
 return b;
end $$;
create function private.consume(g uuid,c uuid,co uuid,q integer,e uuid,s uuid default null,dest uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r record; n integer; left_q integer:=q; target uuid;
begin
 if q<1 or co is null then raise exception 'INVALID_QUANTITY_OR_COACH'; end if;
 if coalesce((select sum(a.balance) from public.package_allocations a join public.packages p on p.id=a.package_id where p.customer_id=c and a.gym_id=g and a.coach_id=co),0)<q then raise exception 'INSUFFICIENT_CREDITS'; end if;
 for r in select a.id,a.package_id,a.balance,p.unit_price from public.package_allocations a join public.packages p on p.id=a.package_id
 where a.gym_id=g and p.customer_id=c and a.coach_id=co and a.balance>0 order by p.purchased_at,p.id loop
 n:=least(r.balance,left_q); perform private.entry(g,e,r.id,-n);
 if s is not null then insert into public.session_allocations(gym_id,session_id,allocation_id,quantity,unit_price) values(g,s,r.id,n,r.unit_price); end if;
 if dest is not null then
 insert into public.package_allocations(gym_id,package_id,coach_id) values(g,r.package_id,dest) on conflict(package_id,coach_id) do nothing;
 select id into target from public.package_allocations where package_id=r.package_id and coach_id=dest;
 perform private.entry(g,e,target,n);
 end if;
 left_q:=left_q-n; exit when left_q=0;
 end loop;
end $$;
create function private.command(op text,x jsonb,k uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<cmd>>
declare
 a public.user_profiles:=private.actor(); gy public.gyms; c public.customers; tr public.transfer_requests; au public.substitution_authorizations;
 ev public.credit_events; pay public.payments; receipt private.command_receipts;
 cid uuid; owner_id uuid; teacher_id uuid; package_id uuid; allocation_id uuid; event_id uuid; record_id uuid; session_id uuid;
 tier public.price_tiers; q integer; price bigint; reason text:=nullif(trim(x->>'reason'),''); at_time timestamptz; b integer; r record; result jsonb; is_admin boolean:=a.role='admin';
begin
 if k is null or jsonb_typeof(x)<>'object' then raise exception 'INVALID_REQUEST'; end if;
 select * into gy from public.gyms where id=a.gym_id;
 insert into private.command_receipts(gym_id,actor_id,key,operation,payload) values(a.gym_id,a.id,k,op,x) on conflict do nothing;
 select * into receipt from private.command_receipts where gym_id=a.gym_id and actor_id=a.id and key=k for update;
 if receipt.operation<>op or receipt.payload<>x then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if receipt.result is not null then return receipt.result; end if;
 if op not in ('purchase','attendance','transfer_request','transfer_decide','substitution','reconcile','reverse','adjust','customer_save','assignment','staff_status','settings','tier_save','import') then raise exception 'UNKNOWN_COMMAND'; end if;
 if not is_admin and op in ('transfer_decide','substitution','reconcile','reverse','adjust','customer_save','assignment','staff_status','settings','tier_save','import') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(coalesce(x->>'notes',''))>2000 or length(coalesce(reason,''))>2000 then raise exception 'TEXT_TOO_LONG'; end if;
 cid:=nullif(x->>'customer_id','')::uuid;
 if op='transfer_decide' then
 select * into tr from public.transfer_requests where id=(x->>'transfer_id')::uuid and gym_id=a.gym_id;
 if tr.id is null then raise exception 'NOT_FOUND'; end if; cid:=tr.customer_id;
 elsif op='reverse' then
 select * into ev from public.credit_events where id=(x->>'event_id')::uuid and gym_id=a.gym_id;
 if ev.id is null or ev.kind='reversal' then raise exception 'INVALID_REVERSAL'; end if; cid:=ev.customer_id;
 elsif op='reconcile' then
 select * into pay from public.payments where id=(x->>'payment_id')::uuid and gym_id=a.gym_id;
 if pay.id is null then raise exception 'NOT_FOUND'; end if;
 select p.customer_id into cid from public.packages p where p.id=pay.package_id;
 end if;
 if cid is not null then
 select * into c from public.customers where id=cid and gym_id=a.gym_id for update;
 if c.id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 if not c.active and op not in ('reverse','reconcile','customer_save','assignment') then raise exception 'CUSTOMER_INACTIVE'; end if;
 end if;
 if op in ('purchase','attendance','transfer_request','substitution','adjust') and cid is null then raise exception 'CUSTOMER_REQUIRED'; end if;
 if op in ('purchase','attendance','transfer_request','adjust') then
 owner_id:=(x->>'coach_id')::uuid;
 if not exists(select 1 from public.coaches co join public.user_profiles p on p.id=co.id where co.id=owner_id and co.gym_id=a.gym_id and co.active and p.active) then raise exception 'INVALID_COACH'; end if;
 if not private.assigned(a.gym_id,cid,owner_id) then raise exception 'ASSIGNMENT_REQUIRED'; end if;
 if not is_admin and owner_id<>a.id and op<>'attendance' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 q:=(x->>'quantity')::integer;
 if q is null or q<1 or q>100000 then raise exception 'INVALID_QUANTITY'; end if;
 end if;
 if op='customer_save' then
 if cid is null then
 insert into public.customers(gym_id,name,phone,email,notes) values(a.gym_id,trim(x->>'name'),nullif(x->>'phone',''),nullif(x->>'email',''),x->>'notes') returning id into record_id;
 else
 update public.customers set name=trim(x->>'name'),phone=nullif(x->>'phone',''),email=nullif(x->>'email',''),notes=x->>'notes',active=coalesce((x->>'active')::boolean,true),updated_at=now() where id=cid returning id into record_id;
 end if;
 elsif op='assignment' then
 owner_id:=(x->>'coach_id')::uuid;
 if not exists(select 1 from public.coaches where id=owner_id and gym_id=a.gym_id and active) then raise exception 'INVALID_COACH'; end if;
 insert into public.customer_coach_assignments(gym_id,customer_id,coach_id,active) values(a.gym_id,cid,owner_id,coalesce((x->>'active')::boolean,true))
 on conflict(customer_id,coach_id) do update set active=excluded.active; record_id:=cid;
 elsif op='staff_status' then
 perform 1 from public.gyms where id=a.gym_id for update;
 if not coalesce((x->>'active')::boolean,true) and exists(select 1 from public.user_profiles where id=(x->>'staff_id')::uuid and gym_id=a.gym_id and role='admin' and active)
 and (select count(*) from public.user_profiles where gym_id=a.gym_id and role='admin' and active)<=1 then raise exception 'LAST_ADMIN'; end if;
 update public.user_profiles set active=(x->>'active')::boolean where id=(x->>'staff_id')::uuid and gym_id=a.gym_id returning id into record_id;
 if record_id is null then raise exception 'NOT_FOUND'; end if;
 update public.coaches set active=(x->>'active')::boolean where id=record_id and gym_id=a.gym_id;
 elsif op='settings' then
 update public.gym_settings set low_balance_threshold=(x->>'low_balance_threshold')::integer,updated_at=now() where gym_id=a.gym_id; record_id:=a.gym_id;
 elsif op='tier_save' then
 record_id:=nullif(x->>'tier_id','')::uuid;
 if record_id is null then insert into public.price_tiers(gym_id,name,unit_price) values(a.gym_id,x->>'name',(x->>'unit_price')::bigint) returning id into record_id;
 else update public.price_tiers set name=x->>'name',unit_price=(x->>'unit_price')::bigint,active=(x->>'active')::boolean where id=record_id and gym_id=a.gym_id;
 if not found then raise exception 'NOT_FOUND'; end if; end if;
 elsif op='purchase' or op='adjust' then
 price:=(x->>'unit_price')::bigint;
 if op='adjust' then
 if reason is null then raise exception 'REASON_REQUIRED'; end if;
 if x->>'direction'='remove' then
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,cid,a.id,'adjustment',reason) returning id into event_id;
 perform private.consume(a.gym_id,cid,owner_id,q,event_id); record_id:=event_id;
 else price:=null; end if;
 elsif price is null or price<0 then raise exception 'INVALID_PRICE';
 elsif price=0 then if reason is null then raise exception 'REASON_REQUIRED'; end if;
 else
 select * into tier from public.price_tiers where id=nullif(x->>'tier_id','')::uuid and gym_id=a.gym_id and active and unit_price=price;
 if tier.id is null and reason is null then raise exception 'CUSTOM_PRICE_REASON_REQUIRED'; end if;
 end if;
 if event_id is null then
 at_time:=case when op='purchase' then (x->>'purchased_at')::timestamptz else now() end;
 if at_time is null or at_time>now()+interval '5 minutes' then raise exception 'INVALID_DATE'; end if;
 insert into public.packages(gym_id,customer_id,original_coach_id,quantity,unit_price,currency,kind,tier_id,purchased_at,reason)
 values(a.gym_id,cid,owner_id,q,price,gy.currency,case when op='adjust' then 'adjustment' when price=0 then 'complimentary' else 'paid' end,tier.id,at_time,reason) returning id into package_id;
 insert into public.package_allocations(gym_id,package_id,coach_id) values(a.gym_id,package_id,owner_id) returning id into allocation_id;
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,cid,a.id,case when op='adjust' then 'adjustment' when price=0 then 'complimentary' else 'purchase' end,reason) returning id into event_id;
 perform private.entry(a.gym_id,event_id,allocation_id,q);
 if price>0 then
 insert into public.payments(gym_id,package_id,event_id,amount,method,paid_at,recorded_by) values(a.gym_id,package_id,event_id,price*q,x->>'method',at_time,a.id);
 end if; record_id:=package_id;
 end if;
 elsif op='attendance' then
 if q>100 then raise exception 'INVALID_QUANTITY'; end if;
 teacher_id:=(x->>'teaching_coach_id')::uuid;
 at_time:=(x->>'session_at')::timestamptz;
 if at_time is null or at_time>now()+interval '5 minutes' then raise exception 'INVALID_DATE'; end if;
 if not exists(select 1 from public.coaches co join public.user_profiles p on p.id=co.id where co.id=teacher_id and co.gym_id=a.gym_id and co.active and p.active) then raise exception 'INVALID_COACH'; end if;
 if not is_admin and teacher_id<>a.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if teacher_id<>owner_id then
 select * into au from public.substitution_authorizations where id=nullif(x->>'substitution_id','')::uuid and gym_id=a.gym_id and customer_id=cid
 and owning_coach_id=owner_id and teaching_coach_id=teacher_id and session_date=(at_time at time zone gy.timezone)::date for update;
 if au.id is null or au.consumed+q>au.quantity then raise exception 'SUBSTITUTION_REQUIRED'; end if;
 update public.substitution_authorizations set consumed=consumed+q where id=au.id;
 elsif not is_admin and owner_id<>a.id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.sessions s where s.customer_id=cid and s.gym_id=a.gym_id and (s.session_at at time zone gy.timezone)::date=(at_time at time zone gy.timezone)::date
 and not exists(select 1 from public.credit_events e where e.reverses_event_id=s.event_id)) and not coalesce((x->>'acknowledge_duplicate')::boolean,false) then raise exception 'DUPLICATE_DAY_CONFIRMATION'; end if;
 select coalesce(sum(pa.balance),0)-q into b from public.package_allocations pa join public.packages p on p.id=pa.package_id where p.customer_id=cid and pa.coach_id=owner_id;
 if b<0 then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,cid,a.id,'attendance',x->>'notes') returning id into event_id;
 insert into public.sessions(gym_id,customer_id,customer_name,owning_coach_id,teaching_coach_id,recorded_by,event_id,substitution_id,session_at,quantity,remaining_after,notes)
 values(a.gym_id,cid,c.name,owner_id,teacher_id,a.id,event_id,au.id,at_time,q,b,x->>'notes') returning id into session_id;
 perform private.consume(a.gym_id,cid,owner_id,q,event_id,session_id); record_id:=session_id;
 elsif op='transfer_request' then
 teacher_id:=(x->>'destination_coach_id')::uuid;
 if reason is null then raise exception 'REASON_REQUIRED'; end if;
 if not exists(select 1 from public.coaches where id=teacher_id and gym_id=a.gym_id and active) then raise exception 'INVALID_COACH'; end if;
 if coalesce((select sum(pa.balance) from public.package_allocations pa join public.packages p on p.id=pa.package_id where p.customer_id=cid and pa.coach_id=owner_id),0)<q then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.transfer_requests(gym_id,customer_id,source_coach_id,destination_coach_id,quantity,reason,initiated_by)
 values(a.gym_id,cid,owner_id,teacher_id,q,reason,a.id) returning id into record_id;
 elsif op='transfer_decide' then
 select * into tr from public.transfer_requests where id=tr.id for update;
 if tr.status<>'pending' then raise exception 'ALREADY_DECIDED'; end if;
 if x->>'decision' not in ('approved','rejected') or x->>'decision' is null then raise exception 'INVALID_DECISION'; end if;
 if x->>'decision'='approved' then
 if not exists(select 1 from public.coaches where id=tr.destination_coach_id and gym_id=a.gym_id and active) then raise exception 'INVALID_COACH'; end if;
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason) values(a.gym_id,cid,a.id,'transfer',tr.reason) returning id into event_id;
 perform private.consume(a.gym_id,cid,tr.source_coach_id,tr.quantity,event_id,null,tr.destination_coach_id);
 insert into public.customer_coach_assignments(gym_id,customer_id,coach_id) values(a.gym_id,cid,tr.destination_coach_id) on conflict(customer_id,coach_id) do update set active=true;
 end if;
 update public.transfer_requests set status=x->>'decision',approved_by=a.id,event_id=cmd.event_id,decided_at=now() where id=tr.id; record_id:=tr.id;
 elsif op='substitution' then
 if reason is null then raise exception 'REASON_REQUIRED'; end if;
 owner_id:=(x->>'coach_id')::uuid; teacher_id:=(x->>'teaching_coach_id')::uuid;
 if not private.assigned(a.gym_id,cid,owner_id) then raise exception 'ASSIGNMENT_REQUIRED'; end if;
 if (select count(*) from public.coaches where gym_id=a.gym_id and active and id in(owner_id,teacher_id))<>2 then raise exception 'INVALID_COACH'; end if;
 insert into public.substitution_authorizations(gym_id,customer_id,owning_coach_id,teaching_coach_id,session_date,quantity,approved_by,reason)
 values(a.gym_id,cid,owner_id,teacher_id,(x->>'session_date')::date,(x->>'quantity')::integer,a.id,reason) returning id into record_id;
 elsif op='reconcile' then
 select * into pay from public.payments where id=pay.id for update;
 if pay.status='voided' then raise exception 'PAYMENT_VOIDED'; end if;
 if x->>'status' not in ('pending','verified','disputed') or x->>'status' is null then raise exception 'INVALID_STATUS'; end if;
 if reason is null then raise exception 'REASON_REQUIRED'; end if;
 update public.payments set status=x->>'status',verified_by=case when x->>'status'='verified' then a.id else null end,
 verified_at=case when x->>'status'='verified' then now() else null end,updated_at=now() where id=pay.id; record_id:=pay.id;
 elsif op='reverse' then
 if reason is null then raise exception 'REASON_REQUIRED'; end if;
 if exists(select 1 from public.credit_events where reverses_event_id=ev.id) then raise exception 'ALREADY_REVERSED'; end if;
 if exists(select 1 from public.credit_ledger_entries l join public.package_allocations pa on pa.id=l.allocation_id where l.event_id=ev.id and pa.balance-l.delta<0) then
 raise exception 'REVERSAL_DEPENDENCIES: reverse subsequent sessions or transfers for these packages first'; end if;
 insert into public.credit_events(gym_id,customer_id,actor_id,kind,reason,reverses_event_id) values(a.gym_id,cid,a.id,'reversal',reason,ev.id) returning id into event_id;
 for r in select * from public.credit_ledger_entries l where l.event_id=ev.id order by l.allocation_id loop perform private.entry(a.gym_id,event_id,r.allocation_id,-r.delta); end loop;
 update public.payments p set status='voided',updated_at=now() where p.gym_id=a.gym_id and p.event_id=ev.id;
 update public.substitution_authorizations sa set consumed=consumed-s.quantity from public.sessions s where s.event_id=ev.id and s.substitution_id=sa.id;
 record_id:=event_id;
 elsif op='import' then
 result:=private.import_rows(x,a); record_id:=(result->>'id')::uuid;
 end if;
 if result is null then result:=jsonb_build_object('id',record_id,'event_id',event_id,'customer_id',cid); end if;
 if cid is not null then
 result:=result||jsonb_build_object('balance',coalesce((select sum(pa.balance) from public.package_allocations pa join public.packages p on p.id=pa.package_id where p.customer_id=cid),0));
 end if;
 insert into public.audit_logs(gym_id,actor_id,action,record_id,details) values(a.gym_id,a.id,op,record_id,jsonb_build_object('input',x,'result',result));
 update private.command_receipts set result=cmd.result where gym_id=a.gym_id and actor_id=a.id and key=k;
 return result;
end $$;
create function public.gym_command(p_operation text,p_input jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.command(p_operation,p_input,p_key)
$$;
-- Reset implicit function execution grants, then expose only guards and the wrapper.
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.member(uuid),private.is_admin(uuid),private.assigned(uuid,uuid,uuid),private.can_customer(uuid,uuid),private.can_package(uuid,uuid),private.can_event(uuid,uuid),private.command(text,jsonb,uuid) to authenticated;
revoke all on function public.gym_command(text,jsonb,uuid) from public,anon;
grant execute on function public.gym_command(text,jsonb,uuid) to authenticated;
alter default privileges in schema private revoke execute on functions from public;
