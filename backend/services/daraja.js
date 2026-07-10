/**
 * M-Pesa Daraja API client.
 * Per-landlord: every call takes the landlord's credentials/shortcode so one
 * backend can serve many landlords, each with their own paybill.
 */
const axios = require('axios');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PRODUCTION_BASE = 'https://api.safaricom.co.ke';

function baseFor(environment) {
  return environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
}

/**
 * Get an OAuth access token for a given app's credentials.
 * @param {object} cfg { consumerKey, consumerSecret, environment }
 */
async function getAccessToken({ consumerKey, consumerSecret, environment }) {
  if (!consumerKey || !consumerSecret) throw new Error('Consumer key/secret required');
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const { data } = await axios.get(
    `${baseFor(environment)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 20000 }
  );
  return data.access_token;
}

/**
 * Register C2B Validation & Confirmation URLs for a shortcode.
 * @param {object} cfg { consumerKey, consumerSecret, environment, shortcode,
 *                        validationUrl, confirmationUrl }
 */
async function registerUrls({ consumerKey, consumerSecret, environment, shortcode, validationUrl, confirmationUrl }) {
  if (!shortcode || !confirmationUrl) throw new Error('shortcode and confirmationUrl are required');
  const token = await getAccessToken({ consumerKey, consumerSecret, environment });
  const { data } = await axios.post(
    `${baseFor(environment)}/mpesa/c2b/v2/registerurl`,
    {
      ShortCode: shortcode,
      ResponseType: 'Completed',          // process even if validation is skipped
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl || confirmationUrl,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return data;
}

/**
 * Simulate a C2B payment (sandbox only).
 * @param {object} cfg { consumerKey, consumerSecret, environment, shortcode,
 *                        amount, phone, accountNumber }
 */
async function simulateC2B({ consumerKey, consumerSecret, environment, shortcode, amount, phone, accountNumber }) {
  if (environment === 'production') throw new Error('Simulate is only available in sandbox mode');
  const token = await getAccessToken({ consumerKey, consumerSecret, environment });
  const { data } = await axios.post(
    `${baseFor(environment)}/mpesa/c2b/v2/simulate`,
    {
      ShortCode: shortcode,
      CommandID: 'CustomerPayBillOnline',
      Amount: amount,
      Msisdn: phone,
      BillRefNumber: accountNumber,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return data;
}

module.exports = { getAccessToken, registerUrls, simulateC2B };
