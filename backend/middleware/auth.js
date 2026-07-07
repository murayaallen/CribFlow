/**
 * Verify a Supabase user JWT (from the frontend) and attach req.user.
 * Shared by the email and M-Pesa landlord-facing routes.
 */
const supabase = require('../services/supabase');

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = data.user;
  next();
}

module.exports = { requireAuth };
