-- =============================================================================
-- CribFlow — Phase B: money-engine validation (SAFE / non-destructive)
-- =============================================================================
-- Exercises allocation, overpayment→credit, multi-bill oldest-first,
-- delete-payment reversal, late-fee (once, no double-charge), apply-credit and
-- refund-credit against the LIVE database's real triggers/functions.
--
-- It attaches temp data to an existing profile, then RAISES at the end so the
-- whole transaction ROLLS BACK — nothing is saved. The final red "error" box IS
-- the report (look for "VALIDATION REPORT"); every line should read [PASS].
-- A different Postgres error means a real problem — send it to me.
-- =============================================================================
do $$
declare
  v_user uuid;
  v_prop uuid; v_room uuid; v_tenant uuid;
  v_bill uuid; v_bill2 uuid; v_pay uuid;
  v_bal numeric; v_status text; v_credit numeric;
  v_due numeric; v_late numeric; v_credited numeric; v_refunded numeric;
  r text := E'\n============ VALIDATION REPORT (rolled back) ============\n';
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then raise exception 'No profile exists to attach test data to'; end if;

  insert into properties (user_id, name, account_prefix, water_rate_per_unit)
    values (v_user, 'ZZ_TEST_PROP', 'TST', 100) returning id into v_prop;

  -- ---- Case A: exact payment ------------------------------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'A1',10000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test A',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,10000,10000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,10000,'cash');
  select balance,status into v_bal,v_status from bills where id=v_bill;
  select credit_balance into v_credit from tenants where id=v_tenant;
  r := r || (case when v_bal=0 and v_status='paid' and v_credit=0 then '[PASS]' else '[FAIL]' end)
       || ' A exact-pay        balance='||v_bal||' status='||v_status||' credit='||v_credit||'  (expect 0/paid/0)'||E'\n';

  -- ---- Case B: partial payment ----------------------------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'B1',10000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test B',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,10000,10000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,4000,'cash');
  select balance,status into v_bal,v_status from bills where id=v_bill;
  r := r || (case when v_bal=6000 and v_status='partial' then '[PASS]' else '[FAIL]' end)
       || ' B partial-pay      balance='||v_bal||' status='||v_status||'  (expect 6000/partial)'||E'\n';

  -- ---- Case C: overpayment -> credit ----------------------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'C1',10000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test C',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,10000,10000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,15000,'cash') returning id into v_pay;
  select balance,status into v_bal,v_status from bills where id=v_bill;
  select credit_balance into v_credit from tenants where id=v_tenant;
  select credited_amount into v_credited from payments where id=v_pay;
  r := r || (case when v_bal=0 and v_status='paid' and v_credit=5000 and v_credited=5000 then '[PASS]' else '[FAIL]' end)
       || ' C overpay->credit  balance='||v_bal||' credit='||v_credit||' credited_amount='||v_credited||'  (expect 0/5000/5000)'||E'\n';

  -- ---- Case D: multi-bill, oldest-first -------------------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'D1',5000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test D',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,5000,5000,current_date,'unpaid') returning id into v_bill;    -- older
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,2,2026,5000,5000,current_date,'unpaid') returning id into v_bill2;   -- newer
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,7000,'cash');
  select balance into v_bal from bills where id=v_bill;      -- older -> should be 0
  select balance,status into v_credit,v_status from bills where id=v_bill2; -- reuse v_credit as newer balance
  r := r || (case when v_bal=0 and v_credit=3000 and v_status='partial' then '[PASS]' else '[FAIL]' end)
       || ' D multi-oldest1st  older='||v_bal||' newer='||v_credit||'/'||v_status||'  (expect 0 and 3000/partial)'||E'\n';

  -- ---- Case E: delete payment reverses everything ---------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'E1',10000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test E',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,10000,10000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,12000,'cash') returning id into v_pay;
  delete from payments where id=v_pay;
  select balance,status into v_bal,v_status from bills where id=v_bill;
  select credit_balance into v_credit from tenants where id=v_tenant;
  r := r || (case when v_bal=10000 and v_status='unpaid' and v_credit=0 then '[PASS]' else '[FAIL]' end)
       || ' E delete-reversal  balance='||v_bal||' status='||v_status||' credit='||v_credit||'  (expect 10000/unpaid/0)'||E'\n';

  -- ---- Case F: late fee applies once (no double-charge) ---------------------
  update profiles set late_penalty_type='flat', late_penalty_amount=500, grace_period_days=0 where id=v_user;
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'F1',10000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test F',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,10000,10000,current_date - 10,'unpaid') returning id into v_bill;
  perform fn_apply_late_fees(v_user);
  select late_fee,total_due into v_late,v_due from bills where id=v_bill;
  perform fn_apply_late_fees(v_user);                 -- second run must NOT double-charge
  select late_fee into v_credit from bills where id=v_bill; -- reuse v_credit as late_fee after 2nd run
  r := r || (case when v_late=500 and v_due=10500 and v_credit=500 then '[PASS]' else '[FAIL]' end)
       || ' F late-fee-once    late_fee='||v_late||' total_due='||v_due||' after2ndRun='||v_credit||'  (expect 500/10500/500)'||E'\n';

  -- ---- Case G: apply credit to a later open bill ----------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'G1',5000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test G',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,5000,5000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,8000,'cash');   -- pays bill1, banks 3000 credit
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,2,2026,4000,4000,current_date,'unpaid') returning id into v_bill2;
  perform fn_apply_credit(v_tenant);
  select balance,status into v_bal,v_status from bills where id=v_bill2;
  select credit_balance into v_credit from tenants where id=v_tenant;
  r := r || (case when v_bal=1000 and v_status='partial' and v_credit=0 then '[PASS]' else '[FAIL]' end)
       || ' G apply-credit     bill2 balance='||v_bal||'/'||v_status||' credit='||v_credit||'  (expect 1000/partial/0)'||E'\n';

  -- ---- Case H: refund credit (cash back) ------------------------------------
  insert into rooms (property_id, name, monthly_rent) values (v_prop,'H1',5000) returning id into v_room;
  insert into tenants (room_id, full_name, lease_start, status) values (v_room,'Test H',current_date,'active') returning id into v_tenant;
  insert into bills (tenant_id,room_id,bill_month,bill_year,rent_amount,total_due,due_date,status)
    values (v_tenant,v_room,1,2026,5000,5000,current_date,'unpaid') returning id into v_bill;
  insert into payments (tenant_id,room_id,amount,method) values (v_tenant,v_room,8000,'cash') returning id into v_pay;
  perform fn_refund_credit(v_tenant);
  select credit_balance into v_credit from tenants where id=v_tenant;
  select credited_amount,refunded_amount into v_credited,v_refunded from payments where id=v_pay;
  r := r || (case when v_credit=0 and v_credited=0 and v_refunded=3000 then '[PASS]' else '[FAIL]' end)
       || ' H refund-credit    credit='||v_credit||' credited='||v_credited||' refunded='||v_refunded||'  (expect 0/0/3000)'||E'\n';

  r := r || E'=========================================================\n';
  raise exception '%', r;   -- forces full rollback; the message above is the report
end $$;
