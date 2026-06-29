/**
 * Supabase service-role client.
 * Used by the backend to write data on behalf of the system
 * (e.g., recording M-Pesa callbacks). Bypasses RLS — use carefully.
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env');
}

const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;
