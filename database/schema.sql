-- =============================================================================
-- RentFlow — Property Management System
-- Database Schema (Supabase / PostgreSQL)
-- =============================================================================
-- Run this in the Supabase SQL Editor on a fresh project.
-- After running, run policies.sql to enable Row Level Security.
-- =============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

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
-- 2. PROPERTIES
-- =============================================================================
create table public.properties (
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
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
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
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
-- 8. M-PESA TRANSACTIONS (raw Daraja callbacks)
-- =============================================================================
create table public.mpesa_transactions (
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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

-- Auto-recalculate bill status when a payment is recorded
create or replace function recalculate_bill_status()
returns trigger as $$
declare
  v_total_paid numeric(10,2);
  v_total_due numeric(10,2);
begin
  if new.bill_id is not null then
    select coalesce(sum(amount), 0) into v_total_paid
      from payments where bill_id = new.bill_id;
    select total_due into v_total_due
      from bills where id = new.bill_id;

    update bills
      set total_paid = v_total_paid,
          status = case
            when v_total_paid >= v_total_due then 'paid'
            when v_total_paid > 0 then 'partial'
            else 'unpaid'
          end
      where id = new.bill_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_recalculate_bill_after_payment
  after insert on payments
  for each row execute function recalculate_bill_status();

-- Auto-create a profile row when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
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
