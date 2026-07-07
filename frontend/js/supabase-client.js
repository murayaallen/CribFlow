/* =============================================================================
   SUPABASE CLIENT
   Configure your project URL and anon key in /js/config.js
   ============================================================================= */

// Supabase is loaded via CDN in HTML files
// const { createClient } = supabase;

const sb = (() => {
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) {
    console.warn('CONFIG not loaded — Supabase will not work');
    return null;
  }
  return supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
})();

/* =============================================================================
   AUTH HELPERS
   ============================================================================= */

async function getCurrentUser() {
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('profile fetch error:', error);
    return null;
  }
  return { ...data, email: user.email };
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/auth.html';
}

/* Run on every protected page — redirects to auth if not logged in */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/auth.html';
    return null;
  }
  return user;
}

/* Run on auth page — redirects to dashboard if already logged in */
async function redirectIfAuthed() {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = '/index.html';
  }
}

/* =============================================================================
   BACKEND API — authenticated calls to the Express server (email, etc.)
   Attaches the current Supabase JWT so the backend can verify the caller.
   ============================================================================= */
async function apiPost(path, body) {
  if (typeof CONFIG === 'undefined' || !CONFIG.API_URL) {
    throw new Error('Backend API not configured (CONFIG.API_URL)');
  }
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${CONFIG.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON response */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

async function apiGet(path) {
  if (typeof CONFIG === 'undefined' || !CONFIG.API_URL) {
    throw new Error('Backend API not configured (CONFIG.API_URL)');
  }
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${CONFIG.API_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
