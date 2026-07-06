-- =============================================================================
-- CribFlow — Property Management System
-- Database Schema (Supabase / PostgreSQL)
-- =============================================================================
-- Run this in the Supabase SQL Editor on a fresh project.
-- After running, run policies.sql to enable Row Level Security.
-- =============================================================================

-- UUIDs: gen_random_uuid() is built into Postgres 13+ (no extension needed).

-- =============================================================================
-- 1. PROFILES (extends Supabase auth.users with landlord info)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  business_name text,
  business_logo_url text,
  paybill_number text,                              -- M-Pesa shortcode
  account_prefix text,                              -- e.g. "SRC" → SRC-A1
  reminder_days int default 5,                      -- days after due date
  late_penalty_type text check (late_penalty_type in ('flat','percent','none')) default 'none',
  late_penalty_amount numeric(10,2) default 0,
  grace_period_days int default 5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- 1b. SUBSCRIPTIONS (one per landlord — plan tier + limits)
-- One row per user, created automatically on signup (see handle_new_user).
-- =============================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('free','basic','pro')) default 'free',
  status text not null check (status in ('active','past_due','canceled')) default 'active',
  max_properties int not null default 2,
  max_rooms_per_property int not null default 10,
  features jsonb not null default '{"email":false,"reports":false,"reminders":false,"sms":false}'::jsonb,
  current_period_end timestamptz,                   -- null = no expiry (free)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_user on public.subscriptions(user_id);

-- =============================================================================
-- 2. PROPERTIES
-- =============================================================================
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  address text,
  county text,
  description text,
  naming_convention text check (naming_convention in ('letters','numbers','alphanumeric','custom')) default 'alphanumeric',
  water_rate_per_unit numeric(10,2) default 0,    -- KSh per unit
  account_prefix text,                              -- overrides profile prefix per property
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_properties_user on public.properties(user_id);

-- =============================================================================
-- 3. ROOMS / UNITS
-- =============================================================================
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,                               -- A1, B2, Room 3, etc.
  unit_type text,                                   -- bedsitter, 1br, 2br, single, etc.
  monthly_rent numeric(10,2) not null default 0,
  status text check (status in ('occupied','vacant','maintenance')) default 'vacant',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, name)                        -- room names unique within property
);

create index idx_rooms_property on public.rooms(property_id);
create index idx_rooms_name_lower on public.rooms(property_id, lower(name));   -- case-insensitive M-Pesa matching

-- =============================================================================
-- 4. TENANTS
-- =============================================================================
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  full_name text not null,
  national_id text,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  lease_start date not null,
  lease_end date,
  deposit_paid numeric(10,2) default 0,
  status text check (status in ('active','past','evicted')) default 'active',
  move_in_date date,
  move_out_date date,
  credit_balance numeric(10,2) default 0,           -- overpayment carry-forward
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_tenants_room on public.tenants(room_id);
create index idx_tenants_status on public.tenants(status);
-- Only one ACTIVE tenant per room
create unique index idx_one_active_tenant_per_room
  on public.tenants(room_id) where status = 'active';

-- =============================================================================
-- 5. WATER READINGS
-- =============================================================================
create table public.water_readings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  reading_month int not null check (reading_month between 1 and 12),
  reading_year int not null,
  previous_reading numeric(10,2) default 0,
  current_reading numeric(10,2) not null,
  units_used numeric(10,2) generated always as (current_reading - previous_reading) stored,
  rate_at_reading numeric(10,2) not null,           -- snapshot of water rate
  amount_due numeric(10,2) generated always as ((current_reading - previous_reading) * rate_at_reading) stored,
  notes text,
  created_at timestamptz default now(),
  unique (room_id, reading_month, reading_year),
  check (current_reading >= previous_reading)
);

create index idx_water_room_period on public.water_readings(room_id, reading_year, reading_month);

-- =============================================================================
-- 6. MONTHLY BILLS
-- =============================================================================
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  -- restrict: a tenant/room with financial history can NEVER be hard-deleted,
  -- so bills are preserved. Removal is via soft-delete (tenant status / archive).
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  bill_month int not null check (bill_month between 1 and 12),
  bill_year int not null,
  rent_amount numeric(10,2) not null default 0,
  water_amount numeric(10,2) default 0,
  water_reading_id uuid references public.water_readings(id) on delete set null,
  other_charges numeric(10,2) default 0,
  other_charges_description text,
  late_fee numeric(10,2) default 0,
  previous_balance numeric(10,2) default 0,
  credit_applied numeric(10,2) default 0,
  total_due numeric(10,2) not null,
  total_paid numeric(10,2) default 0,
  balance numeric(10,2) generated always as (total_due - total_paid) stored,
  status text check (status in ('unpaid','partial','paid','void')) default 'unpaid',
  due_date date not null,
  email_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, bill_month, bill_year)
);

create index idx_bills_tenant on public.bills(tenant_id);
create index idx_bills_room on public.bills(room_id);
create index idx_bills_period on public.bills(bill_year, bill_month);
create index idx_bills_status on public.bills(status);

-- =============================================================================
-- 7. PAYMENTS
-- =============================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- restrict: payment history is never destroyed by deleting a tenant/room.
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  bill_id uuid references public.bills(id) on delete set null,  -- legacy hint; allocation is authoritative
  amount numeric(10,2) not null check (amount > 0),
  credited_amount numeric(10,2) not null default 0, -- portion banked to tenant credit (overpayment)
  refunded_amount numeric(10,2) not null default 0, -- portion of credit later refunded in cash
  method text check (method in ('mpesa','bank','cash','other')) not null,
  mpesa_code text,                                  -- transaction code
  reference text,                                   -- bank ref, cash receipt no.
  payment_date timestamptz not null default now(),
  recorded_by text default 'manual',                -- 'manual' or 'auto'
  notes text,
  created_at timestamptz default now()
);

create index idx_payments_tenant on public.payments(tenant_id);
create index idx_payments_bill on public.payments(bill_id);
create index idx_payments_date on public.payments(payment_date desc);
create unique index idx_payments_mpesa_code on public.payments(mpesa_code) where mpesa_code is not null;

-- =============================================================================
-- 7b. PAYMENT ALLOCATIONS — how each payment is split across bills
-- A payment is auto-allocated across the tenant's open bills, oldest-first.
-- bills.total_paid is always recomputed from these rows (see triggers below).
-- =============================================================================
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  bill_id    uuid not null references public.bills(id)    on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  created_at timestamptz default now(),
  unique (payment_id, bill_id)
);

create index idx_alloc_payment on public.payment_allocations(payment_id);
create index idx_alloc_bill    on public.payment_allocations(bill_id);

-- =============================================================================
-- 8. M-PESA TRANSACTIONS (raw Daraja callbacks)
-- =============================================================================
create table public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  transaction_id text unique not null,              -- M-Pesa code (idempotency)
  transaction_type text,                            -- Pay Bill, Buy Goods, etc.
  amount numeric(10,2) not null,
  phone_number text,
  first_name text,
  middle_name text,
  last_name text,
  account_number text,                              -- what tenant typed
  business_shortcode text,
  transaction_time timestamptz,
  matched boolean default false,
  payment_id uuid references public.payments(id) on delete set null,
  raw_payload jsonb,
  created_at timestamptz default now()
);

create index idx_mpesa_user on public.mpesa_transactions(user_id);
create index idx_mpesa_matched on public.mpesa_transactions(matched);
create index idx_mpesa_account_lower on public.mpesa_transactions(lower(account_number));

-- =============================================================================
-- 9. EMAIL LOGS
-- =============================================================================
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  bill_id uuid references public.bills(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  recipient_email text not null,
  email_type text check (email_type in ('receipt','bill','reminder','lease_expiry')) not null,
  subject text,
  status text check (status in ('sent','failed','queued')) default 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index idx_email_logs_user on public.email_logs(user_id);
create index idx_email_logs_tenant on public.email_logs(tenant_id);

-- =============================================================================
-- TRIGGERS — auto-update bill status and updated_at
-- =============================================================================

-- Auto-update updated_at on changes
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at before update on profiles
  for each row execute function update_updated_at_column();
create trigger update_properties_updated_at before update on properties
  for each row execute function update_updated_at_column();
create trigger update_rooms_updated_at before update on rooms
  for each row execute function update_updated_at_column();
create trigger update_tenants_updated_at before update on tenants
  for each row execute function update_updated_at_column();
create trigger update_bills_updated_at before update on bills
  for each row execute function update_updated_at_column();
create trigger update_subscriptions_updated_at before update on subscriptions
  for each row execute function update_updated_at_column();

-- -----------------------------------------------------------------------------
-- PLAN ENFORCEMENT — can the user add another property under their plan?
-- Called by the frontend before showing the "add property" form.
-- -----------------------------------------------------------------------------
create or replace function can_add_property(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  select max_properties into v_limit from subscriptions where user_id = p_user_id;
  if v_limit is null then v_limit := 2; end if;          -- default to free-tier limit
  if v_limit < 0 then return true; end if;               -- negative = unlimited (pro)
  select count(*) into v_count from properties where user_id = p_user_id and archived = false;
  return v_count < v_limit;
end;
$$;

-- -----------------------------------------------------------------------------
-- LATE FEES — apply each landlord's policy to overdue bills (one-time per bill).
-- (See database/migrations/002_late_fees.sql for notes; scoping is by caller:
--  auth.uid() for a landlord, NULL under the service role/cron = all landlords.)
-- -----------------------------------------------------------------------------
create or replace function fn_apply_late_fees(p_user_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_scope uuid; v_count int := 0; b record; fee numeric(10,2);
begin
  v_scope := coalesce(p_user_id, auth.uid());
  for b in
    select bl.id, bl.balance, pr.late_penalty_type, pr.late_penalty_amount
      from bills bl
      join rooms r      on r.id = bl.room_id
      join properties p on p.id = r.property_id
      join profiles pr  on pr.id = p.user_id
     where bl.status in ('unpaid','partial')
       and coalesce(bl.late_fee,0) = 0
       and pr.late_penalty_type <> 'none'
       and (bl.due_date + (coalesce(pr.grace_period_days,0) || ' days')::interval) < now()
       and (v_scope is null or p.user_id = v_scope)
  loop
    if b.late_penalty_type = 'flat' then fee := b.late_penalty_amount;
    elsif b.late_penalty_type = 'percent' then fee := round(b.balance * b.late_penalty_amount / 100.0, 2);
    else fee := 0; end if;
    if fee > 0 then
      update bills set late_fee = fee, total_due = total_due + fee where id = b.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- MONTHLY BILL GENERATION — create bills for active tenants who don't have one
-- for the period. rent (from room) + water (from that period's reading).
-- Scoped by caller: auth.uid() for a landlord; NULL under service role = all.
-- (Mirrors the UI "Generate Bills" logic; used by /api/jobs/generate-bills.)
-- -----------------------------------------------------------------------------
create or replace function fn_generate_monthly_bills(
  p_month int, p_year int, p_due_date date, p_user_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_scope uuid; v_count int := 0; t record; v_water numeric(10,2); v_reading uuid; v_rent numeric(10,2);
begin
  v_scope := coalesce(p_user_id, auth.uid());
  for t in
    select tn.id as tenant_id, tn.room_id, rm.monthly_rent
      from tenants tn
      join rooms rm      on rm.id = tn.room_id
      join properties p  on p.id = rm.property_id
     where tn.status = 'active'
       and (v_scope is null or p.user_id = v_scope)
       and not exists (select 1 from bills b
                        where b.tenant_id = tn.id and b.bill_month = p_month and b.bill_year = p_year)
  loop
    select id, amount_due into v_reading, v_water
      from water_readings
     where room_id = t.room_id and reading_month = p_month and reading_year = p_year
     limit 1;
    v_water := coalesce(v_water, 0);
    v_rent  := coalesce(t.monthly_rent, 0);
    insert into bills (tenant_id, room_id, bill_month, bill_year, rent_amount,
                       water_amount, water_reading_id, total_due, due_date, status)
      values (t.tenant_id, t.room_id, p_month, p_year, v_rent,
              v_water, v_reading, v_rent + v_water, p_due_date, 'unpaid');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- CREDIT RESOLUTION — apply a tenant's overpayment credit to open bills, or
-- record a cash refund. Preserves the per-payment ledger invariant:
--   amount = Σ allocations + credited_amount + refunded_amount
-- (See database/migrations/003_credit_resolution.sql for full notes.)
-- -----------------------------------------------------------------------------
create or replace function fn_assert_owns_tenant(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select p.user_id into v_owner
    from tenants t
    join rooms r      on r.id = t.room_id
    join properties p on p.id = r.property_id
   where t.id = p_tenant_id;
  if v_owner is null then raise exception 'Tenant not found'; end if;
  if auth.uid() is not null and v_owner <> auth.uid() then
    raise exception 'Not authorized for this tenant';
  end if;
end;
$$;

create or replace function fn_apply_credit(p_tenant_id uuid, p_amount numeric default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  remaining numeric(10,2); applied numeric(10,2) := 0;
  pay record; target_bill uuid; target_balance numeric(10,2); take numeric(10,2);
begin
  perform fn_assert_owns_tenant(p_tenant_id);
  select coalesce(credit_balance,0) into remaining from tenants where id = p_tenant_id;
  if p_amount is not null then remaining := least(remaining, p_amount); end if;
  if remaining <= 0 then return 0; end if;

  for pay in
    select id, credited_amount from payments
     where tenant_id = p_tenant_id and credited_amount > 0
     order by payment_date, created_at for update
  loop
    exit when remaining <= 0;
    declare pcredit numeric(10,2) := least(pay.credited_amount, remaining);
    begin
      while pcredit > 0 loop
        select id, (total_due - total_paid) into target_bill, target_balance
          from bills
         where tenant_id = p_tenant_id and status <> 'void' and (total_due - total_paid) > 0
         order by bill_year, bill_month limit 1 for update;
        exit when target_bill is null;
        take := least(pcredit, target_balance);
        insert into payment_allocations (payment_id, bill_id, amount)
          values (pay.id, target_bill, take)
          on conflict (payment_id, bill_id) do update set amount = payment_allocations.amount + excluded.amount;
        update payments set credited_amount = credited_amount - take where id = pay.id;
        pcredit := pcredit - take; remaining := remaining - take; applied := applied + take;
      end loop;
    end;
    exit when target_bill is null;
  end loop;

  if applied > 0 then
    update tenants set credit_balance = greatest(0, coalesce(credit_balance,0) - applied) where id = p_tenant_id;
  end if;
  return applied;
end;
$$;

create or replace function fn_refund_credit(p_tenant_id uuid, p_amount numeric default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare remaining numeric(10,2); refunded numeric(10,2) := 0; pay record; take numeric(10,2);
begin
  perform fn_assert_owns_tenant(p_tenant_id);
  select coalesce(credit_balance,0) into remaining from tenants where id = p_tenant_id;
  if p_amount is not null then remaining := least(remaining, p_amount); end if;
  if remaining <= 0 then return 0; end if;

  for pay in
    select id, credited_amount from payments
     where tenant_id = p_tenant_id and credited_amount > 0
     order by payment_date, created_at for update
  loop
    exit when remaining <= 0;
    take := least(pay.credited_amount, remaining);
    update payments set credited_amount = credited_amount - take,
                        refunded_amount = refunded_amount + take
     where id = pay.id;
    remaining := remaining - take; refunded := refunded + take;
  end loop;

  if refunded > 0 then
    update tenants set credit_balance = greatest(0, coalesce(credit_balance,0) - refunded) where id = p_tenant_id;
  end if;
  return refunded;
end;
$$;

-- -----------------------------------------------------------------------------
-- PAYMENT ALLOCATION — single source of truth for applying money to bills.
-- (See database/migrations/001_payment_allocation.sql for the same logic as an
--  idempotent migration + backfill for an already-deployed database.)
-- -----------------------------------------------------------------------------

-- Recompute one bill's total_paid + status from its allocations
create or replace function fn_recompute_bill(p_bill_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_paid numeric(10,2); v_status text;
begin
  if p_bill_id is null then return; end if;
  select coalesce(sum(amount),0) into v_paid from payment_allocations where bill_id = p_bill_id;
  select status into v_status from bills where id = p_bill_id;
  if v_status = 'void' then return; end if;  -- never auto-touch a voided bill
  update bills
     set total_paid = v_paid,
         status = case when v_paid >= total_due then 'paid'
                       when v_paid > 0          then 'partial'
                       else 'unpaid' end
   where id = p_bill_id;
end;
$$;

create or replace function fn_alloc_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform fn_recompute_bill(old.bill_id); return old;
  else perform fn_recompute_bill(new.bill_id); return new; end if;
end;
$$;

create trigger trg_alloc_recompute
  after insert or update or delete on payment_allocations
  for each row execute function fn_alloc_after_change();

-- Allocate one payment across the tenant's open bills, oldest-first;
-- bank any remainder to tenant credit (flagged for manual handling).
create or replace function fn_allocate_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid; v_amount numeric(10,2); v_target uuid; remaining numeric(10,2);
  v_bill record; alloc numeric(10,2); v_balance numeric(10,2);
begin
  select tenant_id, amount, bill_id into v_tenant_id, v_amount, v_target from payments where id = p_payment_id;
  if v_tenant_id is null then return; end if;
  remaining := v_amount;

  -- Targeted bill first (if any), then oldest-first for the remainder
  for v_bill in
    select id, total_due, total_paid from bills
     where tenant_id = v_tenant_id and status <> 'void' and (total_due - total_paid) > 0
     order by case when id = v_target then 0 else 1 end, bill_year, bill_month
     for update
  loop
    exit when remaining <= 0;
    v_balance := v_bill.total_due - v_bill.total_paid;
    alloc := least(remaining, v_balance);
    insert into payment_allocations (payment_id, bill_id, amount)
      values (p_payment_id, v_bill.id, alloc)
      on conflict (payment_id, bill_id) do update set amount = payment_allocations.amount + excluded.amount;
    remaining := remaining - alloc;
  end loop;

  if remaining > 0 then
    update tenants set credit_balance = coalesce(credit_balance,0) + remaining where id = v_tenant_id;
    update payments set credited_amount = remaining where id = p_payment_id;
  end if;
end;
$$;

create or replace function fn_payment_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin perform fn_allocate_payment(new.id); return new; end;
$$;

create trigger trg_payment_allocate
  after insert on payments
  for each row execute function fn_payment_after_insert();

-- Reverse banked credit when a payment is deleted (allocations cascade away)
create or replace function fn_payment_before_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.credited_amount > 0 then
    update tenants set credit_balance = greatest(0, coalesce(credit_balance,0) - old.credited_amount)
     where id = old.tenant_id;
  end if;
  return old;
end;
$$;

create trigger trg_payment_reverse_credit
  before delete on payments
  for each row execute function fn_payment_before_delete();

-- Auto-create a profile + default free subscription when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into public.subscriptions (user_id, plan, status, max_properties, max_rooms_per_property)
  values (new.id, 'free', 'active', 2, 10);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-update room status when tenant becomes active or inactive
create or replace function sync_room_status()
returns trigger as $$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status != new.status) then
    if new.status = 'active' then
      update rooms set status = 'occupied' where id = new.room_id;
    else
      update rooms set status = 'vacant' where id = new.room_id
        and not exists (select 1 from tenants where room_id = new.room_id and status = 'active' and id != new.id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_room_status
  after insert or update on tenants
  for each row execute function sync_room_status();
