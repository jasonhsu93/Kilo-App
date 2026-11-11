-- All staff writes go through guarded commands. Browser/Data API writes are denied.
create schema if not exists private;
revoke all on schema private from public;
create table public.gyms (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 currency text not null default 'TWD' check(currency ~ '^[A-Z]{3}$'), timezone text not null default 'Asia/Taipei', created_at timestamptz not null default now()
);
create table public.user_profiles (
 id uuid primary key references auth.users(id), gym_id uuid not null references public.gyms(id),
 name text not null check(length(name) between 1 and 100), role text not null check(role in ('admin','coach')), active boolean not null default true,
 created_at timestamptz not null default now(), unique(gym_id,id)
);
create table public.coaches (
 id uuid primary key, gym_id uuid not null, name text not null, active boolean not null default true,
 foreign key(gym_id,id) references public.user_profiles(gym_id,id), unique(gym_id,id)
);
create table public.gym_settings (
 gym_id uuid primary key references public.gyms(id), low_balance_threshold integer not null default 3 check(low_balance_threshold between 0 and 100),
 credits_on_recorded_payment boolean not null default true check(credits_on_recorded_payment), updated_at timestamptz not null default now()
);
create table public.price_tiers (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id), name text not null check(length(name) between 1 and 80),
 unit_price bigint not null check(unit_price between 1 and 100000000), active boolean not null default true, unique(gym_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id), name text not null check(length(name) between 1 and 100),
 phone text check(length(phone)<=50), email text check(length(email)<=254), notes text check(length(notes)<=2000), active boolean not null default true,
 external_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(gym_id,id), unique(gym_id,external_id)
);
create table public.customer_coach_assignments (
 gym_id uuid not null, customer_id uuid not null, coach_id uuid not null, active boolean not null default true, created_at timestamptz not null default now(),
 primary key(customer_id,coach_id), foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,coach_id) references public.coaches(gym_id,id)
);
create table public.packages (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, customer_id uuid not null, original_coach_id uuid not null,
 quantity integer not null check(quantity between 1 and 100000), unit_price bigint check(unit_price between 0 and 100000000),
 currency text not null check(currency ~ '^[A-Z]{3}$'), kind text not null check(kind in ('paid','complimentary','opening','adjustment')),
 tier_id uuid, purchased_at timestamptz not null, created_at timestamptz not null default now(), external_id text, reason text,
 foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,original_coach_id) references public.coaches(gym_id,id),
 foreign key(gym_id,tier_id) references public.price_tiers(gym_id,id), unique(gym_id,id), unique(gym_id,external_id),
 check((kind <> 'paid' or unit_price > 0) and (kind <> 'complimentary' or unit_price = 0))
);
create table public.package_allocations (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, package_id uuid not null, coach_id uuid not null,
 balance integer not null default 0 check(balance between 0 and 100000), unique(package_id,coach_id), unique(gym_id,id),
 foreign key(gym_id,package_id) references public.packages(gym_id,id), foreign key(gym_id,coach_id) references public.coaches(gym_id,id)
);
create table public.credit_events (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, customer_id uuid not null, actor_id uuid not null,
 kind text not null check(kind in ('purchase','attendance','transfer','complimentary','opening','adjustment','reversal')),
 reason text, reverses_event_id uuid unique, created_at timestamptz not null default now(), unique(gym_id,id),
 foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,actor_id) references public.user_profiles(gym_id,id),
 foreign key(gym_id,reverses_event_id) references public.credit_events(gym_id,id)
);
create table public.credit_ledger_entries (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, event_id uuid not null, allocation_id uuid not null,
 delta integer not null check(delta<>0), balance_after integer not null check(balance_after>=0), created_at timestamptz not null default now(),
 foreign key(gym_id,event_id) references public.credit_events(gym_id,id), foreign key(gym_id,allocation_id) references public.package_allocations(gym_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, package_id uuid not null unique, event_id uuid not null,
 amount bigint not null check(amount between 1 and 10000000000000), method text not null check(method in ('cash','bank','card','other')),
 paid_at timestamptz not null, status text not null default 'pending' check(status in ('pending','verified','disputed','voided')),
 recorded_by uuid not null, verified_by uuid, verified_at timestamptz, updated_at timestamptz not null default now(),
 foreign key(gym_id,package_id) references public.packages(gym_id,id), foreign key(gym_id,event_id) references public.credit_events(gym_id,id),
 foreign key(gym_id,recorded_by) references public.user_profiles(gym_id,id), foreign key(gym_id,verified_by) references public.user_profiles(gym_id,id), unique(gym_id,id)
);
create table public.substitution_authorizations (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, customer_id uuid not null, owning_coach_id uuid not null, teaching_coach_id uuid not null,
 session_date date not null, quantity integer not null check(quantity between 1 and 100), consumed integer not null default 0 check(consumed>=0 and consumed<=quantity),
 approved_by uuid not null, reason text not null check(length(trim(reason)) between 1 and 2000), created_at timestamptz not null default now(),
 foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,owning_coach_id) references public.coaches(gym_id,id),
 foreign key(gym_id,teaching_coach_id) references public.coaches(gym_id,id), foreign key(gym_id,approved_by) references public.user_profiles(gym_id,id),
 check(owning_coach_id<>teaching_coach_id), unique(gym_id,id)
);
create table public.sessions (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, customer_id uuid not null, customer_name text not null,
 owning_coach_id uuid not null, teaching_coach_id uuid not null, recorded_by uuid not null, event_id uuid not null unique,
 substitution_id uuid, session_at timestamptz not null, quantity integer not null check(quantity between 1 and 100), remaining_after integer not null check(remaining_after>=0), notes text,
 created_at timestamptz not null default now(), unique(gym_id,id),
 foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,owning_coach_id) references public.coaches(gym_id,id),
 foreign key(gym_id,teaching_coach_id) references public.coaches(gym_id,id), foreign key(gym_id,recorded_by) references public.user_profiles(gym_id,id),
 foreign key(gym_id,event_id) references public.credit_events(gym_id,id), foreign key(gym_id,substitution_id) references public.substitution_authorizations(gym_id,id)
);
create table public.session_allocations (
 gym_id uuid not null, session_id uuid not null, allocation_id uuid not null, quantity integer not null check(quantity>0), unit_price bigint,
 primary key(session_id,allocation_id), foreign key(gym_id,session_id) references public.sessions(gym_id,id), foreign key(gym_id,allocation_id) references public.package_allocations(gym_id,id)
);
create table public.transfer_requests (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null, customer_id uuid not null, source_coach_id uuid not null, destination_coach_id uuid not null,
 quantity integer not null check(quantity between 1 and 100000), reason text not null check(length(trim(reason)) between 1 and 2000),
 initiated_by uuid not null, approved_by uuid, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 event_id uuid, created_at timestamptz not null default now(), decided_at timestamptz, unique(gym_id,id),
 foreign key(gym_id,customer_id) references public.customers(gym_id,id), foreign key(gym_id,source_coach_id) references public.coaches(gym_id,id),
 foreign key(gym_id,destination_coach_id) references public.coaches(gym_id,id), foreign key(gym_id,initiated_by) references public.user_profiles(gym_id,id),
 foreign key(gym_id,approved_by) references public.user_profiles(gym_id,id), foreign key(gym_id,event_id) references public.credit_events(gym_id,id), check(source_coach_id<>destination_coach_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id), actor_id uuid not null,
 action text not null, record_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(gym_id,actor_id) references public.user_profiles(gym_id,id)
);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), gym_id uuid not null references public.gyms(id), external_id text not null, actor_id uuid not null,
 row_count integer not null check(row_count>0), created_at timestamptz not null default now(), unique(gym_id,external_id),
 foreign key(gym_id,actor_id) references public.user_profiles(gym_id,id)
);
create table private.command_receipts (
 gym_id uuid not null, actor_id uuid not null, key uuid not null, operation text not null, payload jsonb not null, result jsonb,
 primary key(gym_id,actor_id,key)
);
create index on public.customer_coach_assignments(gym_id,coach_id,active);
create index on public.customers(gym_id,active);
create index on public.packages(gym_id,customer_id,purchased_at,id);
create index on public.package_allocations(gym_id,coach_id);
create index on public.credit_events(gym_id,customer_id,created_at);
create index on public.credit_ledger_entries(event_id);
create index on public.sessions(gym_id,session_at);
create index on public.payments(gym_id,status,paid_at);
create index on public.transfer_requests(gym_id,status);
create index on public.substitution_authorizations(gym_id,teaching_coach_id,session_date);

create function private.actor() returns public.user_profiles language plpgsql stable security definer set search_path='' as $$
declare a public.user_profiles;
begin
 select * into a from public.user_profiles where id=auth.uid() and active;
 if a.id is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 return a;
end $$;
create function private.is_admin(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_profiles where id=auth.uid() and gym_id=g and active and role='admin')
$$;
create function private.member(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_profiles where id=auth.uid() and gym_id=g and active)
$$;
create function private.assigned(g uuid,c uuid,co uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.customer_coach_assignments where gym_id=g and customer_id=c and coach_id=co and active)
$$;
create function private.can_customer(g uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(g) and (private.is_admin(g) or private.assigned(g,c,auth.uid()) or exists(
 select 1 from public.substitution_authorizations s join public.gyms y on y.id=g where s.gym_id=g and s.customer_id=c and s.teaching_coach_id=auth.uid()
 and s.consumed<s.quantity and s.session_date >= (now() at time zone y.timezone)::date))
$$;
create function private.can_package(g uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(g) and (private.is_admin(g) or exists(select 1 from public.packages k where k.id=p and k.gym_id=g
 and private.assigned(g,k.customer_id,auth.uid()) and (k.original_coach_id=auth.uid() or exists(select 1 from public.package_allocations a where a.package_id=k.id and a.coach_id=auth.uid()))))
$$;
create function private.can_event(g uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(g) and (private.is_admin(g) or exists(select 1 from public.credit_events where id=e and gym_id=g and actor_id=auth.uid())
 or exists(select 1 from public.credit_ledger_entries l join public.package_allocations a on a.id=l.allocation_id where l.event_id=e and l.gym_id=g and a.coach_id=auth.uid()))
$$;

-- RLS uses non-recursive, tenant-checking helpers. No table write policies exist.
do $$ declare t text; begin
 foreach t in array array['gyms','user_profiles','coaches','gym_settings','price_tiers','customers','customer_coach_assignments','packages','package_allocations','credit_events','credit_ledger_entries','payments','substitution_authorizations','sessions','session_allocations','transfer_requests','audit_logs','import_batches'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy gym_read on public.gyms for select to authenticated using(private.member(id));
create policy profile_read on public.user_profiles for select to authenticated using(private.is_admin(gym_id) or (id=auth.uid() and private.member(gym_id)));
create policy coach_read on public.coaches for select to authenticated using(private.member(gym_id));
create policy settings_read on public.gym_settings for select to authenticated using(private.member(gym_id));
create policy tier_read on public.price_tiers for select to authenticated using(private.member(gym_id));
create policy customer_read on public.customers for select to authenticated using(private.can_customer(gym_id,id));
create policy assignment_read on public.customer_coach_assignments for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or coach_id=auth.uid()));
create policy package_read on public.packages for select to authenticated using(private.can_package(gym_id,id));
create policy allocation_read on public.package_allocations for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or coach_id=auth.uid()));
create policy event_read on public.credit_events for select to authenticated using(private.can_event(gym_id,id));
create policy ledger_read on public.credit_ledger_entries for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or exists(select 1 from public.package_allocations a where a.id=allocation_id and a.coach_id=auth.uid())));
create policy payment_read on public.payments for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or exists(select 1 from public.packages p where p.id=package_id and p.original_coach_id=auth.uid() and private.assigned(p.gym_id,p.customer_id,auth.uid()))));
create policy substitution_read on public.substitution_authorizations for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or teaching_coach_id=auth.uid() or owning_coach_id=auth.uid()));
create policy session_read on public.sessions for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or owning_coach_id=auth.uid() or teaching_coach_id=auth.uid() or recorded_by=auth.uid()));
create policy session_allocation_read on public.session_allocations for select to authenticated using(exists(select 1 from public.sessions s where s.id=session_id));
create policy transfer_read on public.transfer_requests for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or source_coach_id=auth.uid() or destination_coach_id=auth.uid()));
create policy audit_read on public.audit_logs for select to authenticated using(private.member(gym_id) and (private.is_admin(gym_id) or actor_id=auth.uid()));
create policy import_read on public.import_batches for select to authenticated using(private.is_admin(gym_id));

-- Ledger and original facts are immutable even to accidental privileged UPDATEs.
create function private.immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'IMMUTABLE_HISTORY'; end $$;
create trigger immutable_ledger before update or delete on public.credit_ledger_entries for each row execute function private.immutable();
create trigger immutable_events before update or delete on public.credit_events for each row execute function private.immutable();
create trigger immutable_packages before update or delete on public.packages for each row execute function private.immutable();
create trigger immutable_sessions before update or delete on public.sessions for each row execute function private.immutable();
create trigger immutable_session_allocations before update or delete on public.session_allocations for each row execute function private.immutable();
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function private.immutable();
