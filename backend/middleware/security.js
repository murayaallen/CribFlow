/**
 * Lightweight security + ops middleware (no extra dependencies).
 *   - securityHeaders: sensible headers for a JSON API
 *   - requestId + logging helpers
 *   - rateLimiter: simple in-memory fixed-window limiter per IP
 *   - ipAllowlist: optional allowlist (used for M-Pesa callbacks)
 */
const crypto = require('crypto');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  // Meaningful once served over HTTPS (via the DirectAdmin/Nginx TLS proxy)
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Fixed-window in-memory rate limiter.
 * @param {object} opts { windowMs, max, name }
 */
function rateLimiter({ windowMs = 60_000, max = 300, name = 'api' } = {}) {
  const hits = new Map();               // key -> { count, resetAt }
  // Periodic cleanup so the map doesn't grow unbounded
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref?.();

  return function (req, res, next) {
    const now = Date.now();
    const key = `${name}:${req.ip}`;
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count++;
    if (rec.count > max) {
      res.setHeader('Retry-After', Math.ceil((rec.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

/**
 * Optional IP allowlist. If `envVar` is unset/empty, allows everything (no-op),
 * so it's safe by default and only enforced once you configure Safaricom's IPs.
 * Accepts a comma-separated list of exact IPs.
 */
function ipAllowlist(envVar) {
  const raw = (process.env[envVar] || '').trim();
  const allowed = raw ? new Set(raw.split(',').map(s => s.trim()).filter(Boolean)) : null;
  return function (req, res, next) {
    if (!allowed) return next();                 // not configured => allow
    const ip = (req.ip || '').replace('::ffff:', '');
    if (allowed.has(ip)) return next();
    console.warn(`[security] blocked ${req.method} ${req.path} from ${ip} (not in ${envVar})`);
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { securityHeaders, requestId, rateLimiter, ipAllowlist };
