-- =============================================================================
-- RentFlow — Migration 001: DB-side payment allocation
-- =============================================================================
-- WHAT THIS DOES
--   Replaces the old "one payment → one bill, sum payments per bill" model with
--   a single source of truth for how money is applied:
--
--     * payment_allocations(payment_id, bill_id, amount) — a payment can be
--       split across several bills.
--     * Every payment is auto-allocated across the tenant's OPEN bills,
--       oldest-first, the moment it is inserted (any entry path: manual,
--       billing modal, M-Pesa auto-match, manual match).
--     * bills.total_paid is always recomputed from allocations (never trusted
--       from the client), keeping the generated bills.balance correct.
--     * Any money left after every open bill is filled is banked to
--       tenants.credit_balance and FLAGGED for manual handling in the UI
--       (landlord decides: refund or apply forward). It is NOT auto-consumed.
--
-- SAFE TO RE-RUN. Idempotent. Includes a backfill that rebuilds totals from
-- existing payments, so it is safe on both a fresh DB and one with data.
-- Run AFTER schema.sql. RLS for the new table is included at the bottom.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. New table + payment bookkeeping column
-- -----------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id uuid primary key default uuid_generate_v4(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  bill_id    uuid not null references public.bills(id)    on delete cascade,
  amount     numeric(10,2) not null check (amount > 0),
  created_at timestamptz default now(),
  unique (payment_id, bill_id)
);

create index if not exists idx_alloc_payment on public.payment_allocations(payment_id);
create index if not exists idx_alloc_bill    on public.payment_allocations(bill_id);

-- How much of a payment was banked to tenant credit (so we can reverse on delete)
alter table public.payments
  add column if not exists credited_amount numeric(10,2) not null default 0;

-- -----------------------------------------------------------------------------
-- 2. Remove the old per-bill recalculation trigger (superseded)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_recalculate_bill_after_payment on public.payments;
drop function if exists public.recalculate_bill_status();

-- -----------------------------------------------------------------------------
-- 3. Recompute a single bill's total_paid + status from its allocations
-- -----------------------------------------------------------------------------
create or replace function public.fn_recompute_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric(10,2);
  v_due  numeric(10,2);
  v_status text;
begin
  if p_bill_id is null then return; end if;

  select coalesce(sum(amount), 0) into v_paid
    from payment_allocations where bill_id = p_bill_id;

  select total_due, status into v_due, v_status
    from bills where id = p_bill_id;

  if v_status = 'void' then
    return;  -- never auto-touch a voided bill
  end if;

  update bills
     set total_paid = v_paid,
         status = case
                    when v_paid >= total_due then 'paid'
                    when v_paid > 0          then 'partial'
                    else 'unpaid'
                  end
   where id = p_bill_id;
end;
$$;

-- Keep bills in sync whenever allocations change
create or replace function public.fn_alloc_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform fn_recompute_bill(old.bill_id);
    return old;
  else
    perform fn_recompute_bill(new.bill_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_alloc_recompute on public.payment_allocations;
create trigger trg_alloc_recompute
  after insert or update or delete on public.payment_allocations
  for each row execute function fn_alloc_after_change();

-- -----------------------------------------------------------------------------
-- 4. Allocate one payment across the tenant's open bills, oldest-first
-- -----------------------------------------------------------------------------
create or replace function public.fn_allocate_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_amount    numeric(10,2);
  v_target    uuid;            -- optional bill the landlord aimed this payment at
  remaining   numeric(10,2);
  v_bill      record;
  alloc       numeric(10,2);
  v_balance   numeric(10,2);
begin
  select tenant_id, amount, bill_id into v_tenant_id, v_amount, v_target
    from payments where id = p_payment_id;
  if v_tenant_id is null then return; end if;

  remaining := v_amount;

  -- Fill the explicitly targeted bill first (if any), then the rest oldest-first.
  -- Lock the open bills so concurrent payments can't double-allocate.
  for v_bill in
    select id, total_due, total_paid
      from bills
     where tenant_id = v_tenant_id
       and status <> 'void'
       and (total_due - total_paid) > 0
     order by case when id = v_target then 0 else 1 end, bill_year, bill_month
     for update
  loop
    exit when remaining <= 0;
    v_balance := v_bill.total_due - v_bill.total_paid;
    alloc := least(remaining, v_balance);

    insert into payment_allocations (payment_id, bill_id, amount)
      values (p_payment_id, v_bill.id, alloc)
      on conflict (payment_id, bill_id)
      do update set amount = payment_allocations.amount + excluded.amount;

    remaining := remaining - alloc;
  end loop;

  -- Whatever is left is an overpayment → bank to tenant credit, flag for review
  if remaining > 0 then
    update tenants
       set credit_balance = coalesce(credit_balance, 0) + remaining
     where id = v_tenant_id;
    update payments set credited_amount = remaining where id = p_payment_id;
  end if;
end;
$$;

-- Run allocation automatically on every new payment
create or replace function public.fn_payment_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_allocate_payment(new.id);
  return new;
end;
$$;

drop trigger if exists trg_payment_allocate on public.payments;
create trigger trg_payment_allocate
  after insert on public.payments
  for each row execute function fn_payment_after_insert();

-- Reverse banked credit when a payment is deleted (allocations cascade + recompute)
create or replace function public.fn_payment_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.credited_amount > 0 then
    update tenants
       set credit_balance = greatest(0, coalesce(credit_balance, 0) - old.credited_amount)
     where id = old.tenant_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_payment_reverse_credit on public.payments;
create trigger trg_payment_reverse_credit
  before delete on public.payments
  for each row execute function fn_payment_before_delete();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security for payment_allocations (read-only for owners).
--    Inserts/updates happen only through the SECURITY DEFINER functions above.
-- -----------------------------------------------------------------------------
alter table public.payment_allocations enable row level security;

drop policy if exists "users see own allocations" on public.payment_allocations;
create policy "users see own allocations" on public.payment_allocations
  for select using (
    bill_id in (
      select b.id from bills b
      join rooms r      on r.id = b.room_id
      join properties p on p.id = r.property_id
      where p.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. BACKFILL — rebuild allocations + totals from existing payments.
--    Resets derived values then replays every payment oldest-first.
--    (Safe on an empty DB: replays nothing.)
-- -----------------------------------------------------------------------------
do $$
declare p record;
begin
  delete from payment_allocations;
  update bills   set total_paid = 0     where total_paid <> 0;
  update tenants set credit_balance = 0 where coalesce(credit_balance,0) <> 0;
  update payments set credited_amount = 0 where credited_amount <> 0;

  for p in (select id from payments order by payment_date, created_at) loop
    perform fn_allocate_payment(p.id);
  end loop;
end;
$$;

commit;
