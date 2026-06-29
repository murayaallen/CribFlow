/* =============================================================================
   CONFIGURATION
   Copy this file to config.js and fill in your Supabase credentials.
   config.js is gitignored — config.example.js is checked in.
   ============================================================================= */

const CONFIG = {
  // Get these from supabase.com → your project → Settings → API
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_KEY_HERE',

  // Backend API (Express server) — leave as-is for local dev
  API_URL: 'http://localhost:3000',

  // Default currency display
  CURRENCY: 'KSh',
  COUNTRY: 'KE',
};
