/**
 * CribFlow Backend Server
 * Express app handling M-Pesa Daraja callbacks and email sending.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const mpesaRoutes = require('./routes/mpesa');
const emailRoutes = require('./routes/email');
const jobRoutes = require('./routes/jobs');
const { securityHeaders, requestId, rateLimiter } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind DirectAdmin/Nginx (Passenger) — trust the proxy so req.ip is the
// real client IP (used by the rate limiter and M-Pesa IP allowlist).
app.set('trust proxy', true);
app.disable('x-powered-by');

// ---- MIDDLEWARE ----
app.use(securityHeaders);
app.use(requestId);

// Lock CORS to the configured frontend origin. In production, refuse to fall
// back to a wildcard (a wildcard with credentials is invalid and unsafe).
const allowedOrigin = process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? false : '*');
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit (per IP). Callback/auth paths get their own tighter limits.
app.use(rateLimiter({ windowMs: 60_000, max: 300, name: 'global' }));

// Request logging with request id
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.id} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ---- HEALTH CHECK ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    mpesa_env: process.env.MPESA_ENV || 'not_configured',
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'CribFlow API',
    version: '1.0.0',
    status: 'running',
  });
});

// ---- ROUTES ----
app.use('/api/mpesa', mpesaRoutes);
// Safaricom rejects callback URLs containing the word "mpesa", so the C2B
// validation/confirmation callbacks are ALSO served here (same router) under a
// safe path. Register these (/api/c2b/confirmation, /api/c2b/validation) with
// Daraja; the app's own connect/status calls keep using /api/mpesa.
app.use('/api/c2b', mpesaRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/jobs', jobRoutes);

// ---- ERROR HANDLER ----
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ---- START ----
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`  CribFlow Backend running on port ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log(`  Health:    http://localhost:${PORT}/health`);
  console.log(`  Frontend:  ${process.env.FRONTEND_URL || 'not configured'}`);
  console.log(`  M-Pesa:    ${process.env.MPESA_ENV || 'not configured'}`);
  console.log(`  Email:     ${process.env.GMAIL_USER ? 'configured' : 'not configured'}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
});
