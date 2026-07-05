-- =============================================================================
-- CribFlow — Migration 002: late-fee engine
-- =============================================================================
-- Applies each landlord's late-fee policy (profiles.late_penalty_type/amount +
-- grace_period_days) to overdue bills. One-time charge per bill: a bill is
-- charged once, after its due_date + grace has passed, while it still has a
-- balance. Adds the fee to bills.late_fee AND bills.total_due (so the generated
-- balance reflects it). Idempotent — a bill with late_fee already set is skipped.
--
-- SCOPING (security): callable two ways —
--   * fn_apply_late_fees(auth.uid())  → a landlord charges only their own bills
--   * fn_apply_late_fees()            → NULL; under a normal user this resolves
--     to auth.uid() (self only); under the service role (cron) auth.uid() is
--     NULL, so it processes ALL landlords.
-- Returns the number of bills charged.
--
-- SAFE TO RE-RUN. Run AFTER schema.sql (or on an existing DB).
-- =============================================================================

begin;

create or replace function public.fn_apply_late_fees(p_user_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope uuid;
  v_count int := 0;
  b record;
  fee numeric(10,2);
begin
  -- A normal caller can only ever affect their own bills; cron (service role,
  -- auth.uid() = null) affects everyone.
  v_scope := coalesce(p_user_id, auth.uid());

  for b in
    select bl.id,
           bl.balance,
           pr.late_penalty_type,
           pr.late_penalty_amount
      from bills bl
      join rooms r       on r.id = bl.room_id
      join properties p  on p.id = r.property_id
      join profiles pr   on pr.id = p.user_id
     where bl.status in ('unpaid','partial')
       and coalesce(bl.late_fee, 0) = 0
       and pr.late_penalty_type <> 'none'
       and (bl.due_date + (coalesce(pr.grace_period_days, 0) || ' days')::interval) < now()
       and (v_scope is null or p.user_id = v_scope)
  loop
    if b.late_penalty_type = 'flat' then
      fee := b.late_penalty_amount;
    elsif b.late_penalty_type = 'percent' then
      fee := round(b.balance * b.late_penalty_amount / 100.0, 2);
    else
      fee := 0;
    end if;

    if fee > 0 then
      update bills
         set late_fee = fee,
             total_due = total_due + fee
       where id = b.id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

commit;
