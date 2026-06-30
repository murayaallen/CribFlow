-- =============================================================================
-- RentFlow — Row Level Security Policies
-- =============================================================================
-- Run this AFTER schema.sql.
-- Ensures landlords can only access their own data.
-- =============================================================================

-- Enable RLS on every table
alter table profiles enable row level security;
alter table properties enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table water_readings enable row level security;
alter table bills enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table mpesa_transactions enable row level security;
alter table email_logs enable row level security;

-- =============================================================================
-- PROFILES
-- =============================================================================
create policy "users see own profile" on profiles
  for select using (auth.uid() = id);
create policy "users update own profile" on profiles
  for update using (auth.uid() = id);
create policy "users insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- =============================================================================
-- PROPERTIES
-- =============================================================================
create policy "users see own properties" on properties
  for select using (user_id = auth.uid());
create policy "users insert own properties" on properties
  for insert with check (user_id = auth.uid());
create policy "users update own properties" on properties
  for update using (user_id = auth.uid());
create policy "users delete own properties" on properties
  for delete using (user_id = auth.uid());

-- =============================================================================
-- ROOMS (via property ownership)
-- =============================================================================
create policy "users see own rooms" on rooms
  for select using (
    property_id in (select id from properties where user_id = auth.uid())
  );
create policy "users insert rooms in own properties" on rooms
  for insert with check (
    property_id in (select id from properties where user_id = auth.uid())
  );
create policy "users update own rooms" on rooms
  for update using (
    property_id in (select id from properties where user_id = auth.uid())
  );
create policy "users delete own rooms" on rooms
  for delete using (
    property_id in (select id from properties where user_id = auth.uid())
  );

-- =============================================================================
-- TENANTS (via room → property ownership)
-- =============================================================================
create policy "users see own tenants" on tenants
  for select using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users insert own tenants" on tenants
  for insert with check (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users update own tenants" on tenants
  for update using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users delete own tenants" on tenants
  for delete using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- WATER READINGS
-- =============================================================================
create policy "users see own water readings" on water_readings
  for select using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users insert own water readings" on water_readings
  for insert with check (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users update own water readings" on water_readings
  for update using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users delete own water readings" on water_readings
  for delete using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- BILLS
-- =============================================================================
create policy "users see own bills" on bills
  for select using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users insert own bills" on bills
  for insert with check (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users update own bills" on bills
  for update using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- PAYMENTS
-- =============================================================================
create policy "users see own payments" on payments
  for select using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );
create policy "users insert own payments" on payments
  for insert with check (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- PAYMENT ALLOCATIONS (read only for owners; written only by SECURITY DEFINER
-- allocation functions, so no insert/update/delete policy is needed)
-- =============================================================================
create policy "users see own allocations" on payment_allocations
  for select using (
    bill_id in (
      select b.id from bills b
      join rooms r      on r.id = b.room_id
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- =============================================================================
-- M-PESA TRANSACTIONS (read only for users; backend uses service key to write)
-- =============================================================================
create policy "users see own mpesa transactions" on mpesa_transactions
  for select using (user_id = auth.uid());
create policy "users update own mpesa transactions" on mpesa_transactions
  for update using (user_id = auth.uid());

-- =============================================================================
-- EMAIL LOGS (read only for users)
-- =============================================================================
create policy "users see own email logs" on email_logs
  for select using (user_id = auth.uid());
