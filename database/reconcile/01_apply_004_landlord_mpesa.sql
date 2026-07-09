-- =============================================================================
-- CribFlow — Live DB reconciliation, Step 2: APPLY migration 004
-- =============================================================================
-- The live "CribFlow" project was loaded from a pre-004 schema (11 tables,
-- ending at email_logs). This adds the ONLY missing piece: per-landlord M-Pesa.
--
-- This is migration 004 made fully idempotent (safe to run once or many times):
--   * create table IF NOT EXISTS
--   * drop trigger IF EXISTS before (re)creating it
--   * create unique index IF NOT EXISTS
-- Run in the Supabase SQL Editor against the live project.
-- =============================================================================

begin;

create table if not exists public.landlord_mpesa (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  paybill_number text not null,
  consumer_key text,                                 -- key only; secret NOT stored
  environment text not null check (environment in ('sandbox','production')) default 'production',
  registration_status text not null check (registration_status in ('unregistered','registered','failed')) default 'unregistered',
  registered_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Server-only: RLS on, NO policies => denied to anon/authenticated; the backend
-- (service role) bypasses RLS. Frontend reads status via /api/mpesa/status.
alter table public.landlord_mpesa enable row level security;

-- update_updated_at_column() already exists (from schema.sql).
drop trigger if exists update_landlord_mpesa_updated_at on public.landlord_mpesa;
create trigger update_landlord_mpesa_updated_at before update on public.landlord_mpesa
  for each row execute function update_updated_at_column();

-- A paybill must map to exactly one landlord (prevents ambiguous M-Pesa matching).
create unique index if not exists idx_profiles_paybill_unique
  on public.profiles(paybill_number) where paybill_number is not null;

commit;
