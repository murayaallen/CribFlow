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

const app = express();
const PORT = process.env.PORT || 3000;

// ---- MIDDLEWARE ----
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

// Request logging (simple)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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
