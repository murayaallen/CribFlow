-- =============================================================================
-- CribFlow — Migration 003: credit resolution (apply / refund)
-- =============================================================================
-- Lets a landlord resolve a tenant's overpayment credit (banked to
-- tenants.credit_balance by the allocation engine) in two ways:
--
--   fn_apply_credit(tenant, [amount])  — move credit onto open bills, oldest
--       first. Funds the allocations from the ORIGINAL over-payments'
--       credited_amount, so bills.total_paid rises and credit falls with NO
--       new money invented and no double-counting.
--
--   fn_refund_credit(tenant, [amount]) — record that credit was paid back to the
--       tenant in cash. Moves credited_amount → refunded_amount and lowers
--       credit_balance.
--
-- Ledger invariant preserved for every payment:
--     amount = Σ allocations + credited_amount + refunded_amount
--
-- Both are SECURITY DEFINER and verify the caller owns the tenant (auth.uid()).
-- Under the service role (auth.uid() null) the ownership check is skipped.
-- Amount defaults to the tenant's full credit. Returns the amount handled.
--
-- SAFE TO RE-RUN. Run AFTER schema.sql / migration 001.
-- =============================================================================

begin;

alter table public.payments
  add column if not exists refunded_amount numeric(10,2) not null default 0;

-- Ownership guard shared by both functions
create or replace function public.fn_assert_owns_tenant(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select p.user_id into v_owner
    from tenants t
    join rooms r      on r.id = t.room_id
    join properties p on p.id = r.property_id
   where t.id = p_tenant_id;
  if v_owner is null then
    raise exception 'Tenant not found';
  end if;
  if auth.uid() is not null and v_owner <> auth.uid() then
    raise exception 'Not authorized for this tenant';
  end if;
end;
$$;

-- ---- APPLY CREDIT TO OPEN BILLS -------------------------------------------
create or replace function public.fn_apply_credit(p_tenant_id uuid, p_amount numeric default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  remaining numeric(10,2);
  applied   numeric(10,2) := 0;
  pay       record;
  target_bill uuid;
  target_balance numeric(10,2);
  take numeric(10,2);
begin
  perform fn_assert_owns_tenant(p_tenant_id);

  select coalesce(credit_balance, 0) into remaining from tenants where id = p_tenant_id;
  if p_amount is not null then remaining := least(remaining, p_amount); end if;
  if remaining <= 0 then return 0; end if;

  -- Consume over-payments oldest-first, funding open bills oldest-first.
  for pay in
    select id, credited_amount from payments
     where tenant_id = p_tenant_id and credited_amount > 0
     order by payment_date, created_at
     for update
  loop
    exit when remaining <= 0;
    declare pcredit numeric(10,2) := least(pay.credited_amount, remaining);
    begin
      while pcredit > 0 loop
        -- next open bill (re-selected each time so it reflects prior allocations)
        select id, (total_due - total_paid)
          into target_bill, target_balance
          from bills
         where tenant_id = p_tenant_id and status <> 'void' and (total_due - total_paid) > 0
         order by bill_year, bill_month
         limit 1
         for update;
        exit when target_bill is null;

        take := least(pcredit, target_balance);
        insert into payment_allocations (payment_id, bill_id, amount)
          values (pay.id, target_bill, take)
          on conflict (payment_id, bill_id) do update
            set amount = payment_allocations.amount + excluded.amount;

        update payments set credited_amount = credited_amount - take where id = pay.id;
        pcredit   := pcredit   - take;
        remaining := remaining - take;
        applied   := applied   + take;
      end loop;
    end;
    exit when target_bill is null;  -- no open bills remain
  end loop;

  if applied > 0 then
    update tenants set credit_balance = greatest(0, coalesce(credit_balance,0) - applied)
     where id = p_tenant_id;
  end if;
  return applied;
end;
$$;

-- ---- REFUND CREDIT (cash returned to tenant) ------------------------------
create or replace function public.fn_refund_credit(p_tenant_id uuid, p_amount numeric default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  remaining numeric(10,2);
  refunded  numeric(10,2) := 0;
  pay       record;
  take      numeric(10,2);
begin
  perform fn_assert_owns_tenant(p_tenant_id);

  select coalesce(credit_balance, 0) into remaining from tenants where id = p_tenant_id;
  if p_amount is not null then remaining := least(remaining, p_amount); end if;
  if remaining <= 0 then return 0; end if;

  for pay in
    select id, credited_amount from payments
     where tenant_id = p_tenant_id and credited_amount > 0
     order by payment_date, created_at
     for update
  loop
    exit when remaining <= 0;
    take := least(pay.credited_amount, remaining);
    update payments
       set credited_amount = credited_amount - take,
           refunded_amount = refunded_amount + take
     where id = pay.id;
    remaining := remaining - take;
    refunded  := refunded  + take;
  end loop;

  if refunded > 0 then
    update tenants set credit_balance = greatest(0, coalesce(credit_balance,0) - refunded)
     where id = p_tenant_id;
  end if;
  return refunded;
end;
$$;

commit;
