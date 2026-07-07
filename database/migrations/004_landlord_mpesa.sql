-- =============================================================================
-- CribFlow — Migration 004: per-landlord M-Pesa connection (multi-paybill SaaS)
-- =============================================================================
-- Each landlord connects their OWN paybill. Money goes directly to them; the
-- one shared backend callback URL routes every payment to the right landlord by
-- BusinessShortCode -> profiles.paybill_number (see routes/mpesa.js confirmation).
--
-- This table holds the connection state. SECURITY: the consumer SECRET is never
-- stored — it's used once (server-side) to register the callback URL, then
-- discarded. Receiving C2B callbacks needs no credentials. RLS has NO policies,
-- so the table is readable/writable only by the backend's service-role key.
--
-- Run this in the Supabase SQL Editor (safe to re-run).
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

-- Server-only: RLS on, no policies => denied to anon/authenticated; backend
-- (service role) bypasses RLS. The frontend gets status via /api/mpesa/status.
alter table public.landlord_mpesa enable row level security;

create trigger update_landlord_mpesa_updated_at before update on landlord_mpesa
  for each row execute function update_updated_at_column();

-- A paybill must map to exactly one landlord (prevents ambiguous matching).
create unique index if not exists idx_profiles_paybill_unique
  on public.profiles(paybill_number) where paybill_number is not null;

commit;
