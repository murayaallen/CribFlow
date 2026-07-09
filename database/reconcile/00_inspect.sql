-- =============================================================================
-- CribFlow — Live DB reconciliation, Step 1: INSPECT
-- =============================================================================
-- Read-only. Lists every object the CURRENT canonical schema requires and
-- whether it already exists in this database. Run this in the Supabase SQL
-- Editor against the live "CribFlow" project and share the output.
--
-- "present = false" rows tell us exactly which migration(s) still need to run:
--   fn_apply_late_fees ................... migration 002 (late fees)
--   payments.refunded_amount,
--   fn_apply_credit / fn_refund_credit /
--   fn_assert_owns_tenant ................ migration 003 (credit resolution)
--   landlord_mpesa, idx_profiles_paybill_unique,
--   update_landlord_mpesa_updated_at ..... migration 004 (per-landlord M-Pesa)
--   fn_generate_monthly_bills ............ bill-generation job fn (in schema.sql)
-- =============================================================================
with expected(kind, obj) as (values
  ('table',    'profiles'),
  ('table',    'subscriptions'),
  ('table',    'properties'),
  ('table',    'rooms'),
  ('table',    'tenants'),
  ('table',    'water_readings'),
  ('table',    'bills'),
  ('table',    'payments'),
  ('table',    'payment_allocations'),
  ('table',    'mpesa_transactions'),
  ('table',    'email_logs'),
  ('table',    'landlord_mpesa'),
  ('column',   'tenants.credit_balance'),
  ('column',   'bills.late_fee'),
  ('column',   'payments.credited_amount'),
  ('column',   'payments.refunded_amount'),
  ('function', 'handle_new_user'),
  ('function', 'can_add_property'),
  ('function', 'fn_allocate_payment'),
  ('function', 'fn_apply_late_fees'),
  ('function', 'fn_apply_credit'),
  ('function', 'fn_refund_credit'),
  ('function', 'fn_assert_owns_tenant'),
  ('function', 'fn_generate_monthly_bills'),
  ('index',    'idx_profiles_paybill_unique'),
  ('trigger',  'trg_payment_allocate'),
  ('trigger',  'update_landlord_mpesa_updated_at')
)
select
  e.kind,
  e.obj,
  case
    when e.kind = 'table' then exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = e.obj)
    when e.kind = 'column' then exists(
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name  = split_part(e.obj, '.', 1)
        and column_name = split_part(e.obj, '.', 2))
    when e.kind = 'function' then exists(
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = e.obj)
    when e.kind = 'index' then exists(
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = e.obj)
    when e.kind = 'trigger' then exists(
      select 1 from pg_trigger t
      where not t.tgisinternal and t.tgname = e.obj)
  end as present
from expected e
order by present asc, e.kind, e.obj;
