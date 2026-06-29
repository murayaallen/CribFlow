/**
 * M-Pesa Daraja API client.
 * Handles OAuth tokens and URL registration with Safaricom.
 */
const axios = require('axios');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PRODUCTION_BASE = 'https://api.safaricom.co.ke';

function baseUrl() {
  return (process.env.MPESA_ENV === 'production') ? PRODUCTION_BASE : SANDBOX_BASE;
}

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get an OAuth access token (cached for ~50 minutes).
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY/SECRET not configured');

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const url = `${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const { data } = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

/**
 * Register C2B Validation & Confirmation URLs with Safaricom.
 * Run this ONCE after deploying or whenever URLs change.
 */
async function registerUrls() {
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const validationUrl = process.env.MPESA_VALIDATION_URL;
  const confirmationUrl = process.env.MPESA_CONFIRMATION_URL;

  if (!shortcode || !validationUrl || !confirmationUrl) {
    throw new Error('MPESA_SHORTCODE, MPESA_VALIDATION_URL, or MPESA_CONFIRMATION_URL missing');
  }

  const { data } = await axios.post(
    `${baseUrl()}/mpesa/c2b/v1/registerurl`,
    {
      ShortCode: shortcode,
      ResponseType: 'Completed',         // 'Completed' = process even if validation fails
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return data;
}

/**
 * Simulate a C2B payment (sandbox only).
 */
async function simulateC2B({ amount, phone, accountNumber }) {
  if (process.env.MPESA_ENV === 'production') {
    throw new Error('Simulate is only available in sandbox mode');
  }
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;

  const { data } = await axios.post(
    `${baseUrl()}/mpesa/c2b/v1/simulate`,
    {
      ShortCode: shortcode,
      CommandID: 'CustomerPayBillOnline',
      Amount: amount,
      Msisdn: phone,
      BillRefNumber: accountNumber,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return data;
}

module.exports = { getAccessToken, registerUrls, simulateC2B };
