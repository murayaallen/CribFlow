-- =============================================================================
-- RentFlow — Live schema introspection
-- =============================================================================
-- PURPOSE: capture the TRUE current state of the deployed Supabase database so
-- we can reconcile database/schema.sql (which is stale) to reality before
-- applying any migrations.
--
-- HOW TO USE
--   1. Open the Supabase SQL Editor for your project.
--   2. Paste this whole file and Run.
--   3. The result is ONE row / ONE cell of JSON. Click it, copy it, and send
--      it back (or save it as database/live_schema.json in the repo).
--
-- It is READ-ONLY. It changes nothing.
-- =============================================================================

select jsonb_pretty(jsonb_build_object(

  -- Every column of every table in the public schema
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
  ),

  -- All custom functions / RPCs (incl. trigger functions) with full source
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'definition', pg_get_functiondef(p.oid)
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),

  -- All triggers on public tables
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table,
      'trigger', trigger_name,
      'timing', action_timing,
      'event', event_manipulation,
      'action', action_statement
    ) order by event_object_table, trigger_name)
    from information_schema.triggers
    where trigger_schema = 'public'
  ),

  -- All RLS policies on public tables
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
  ),

  -- Which tables have RLS enabled
  'rls_enabled', (
    select jsonb_agg(jsonb_build_object('table', relname, 'rls', relrowsecurity) order by relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  )

)) as live_schema;
