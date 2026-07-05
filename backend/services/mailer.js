/**
 * Email service using Nodemailer + Gmail SMTP.
 */
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail credentials not configured');
  }
  const fromName = process.env.EMAIL_FROM_NAME || 'CribFlow';
  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to, subject, html, text,
  });
  return info;
}

/* ---- TEMPLATES ---- */

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  line-height: 1.6; color: #1A1A17; max-width: 600px; margin: 0 auto;
`;

function wrap(content, businessName = 'CribFlow') {
  return `
  <!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAFAF6">
    <table role="presentation" style="width:100%;background:#FAFAF6;padding:32px 16px"><tr><td>
      <table role="presentation" style="${baseStyles};background:white;border-radius:12px;overflow:hidden;border:1px solid #E5E2D6">
        <tr><td style="background:linear-gradient(135deg,#0F4C3A 0%,#1A6B53 100%);padding:24px 32px;color:white;">
          <div style="font-size:14px;opacity:.85;letter-spacing:.05em;text-transform:uppercase;font-weight:600">${businessName}</div>
        </td></tr>
        <tr><td style="padding:32px">${content}</td></tr>
        <tr><td style="background:#F5F4EE;padding:18px 32px;font-size:12px;color:#8A877A;text-align:center;border-top:1px solid #E5E2D6">
          Sent by ${businessName} · powered by CribFlow
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function billTemplate({ tenantName, period, total, dueDate, breakdown, accountNumber, paybillNumber, businessName }) {
  const rows = breakdown.map(b => `
    <tr><td style="padding:8px 0;color:#525049">${b.label}</td>
        <td style="padding:8px 0;text-align:right;font-variant-numeric:tabular-nums">KSh ${b.amount}</td></tr>
  `).join('');

  const content = `
    <h1 style="font-size:22px;margin:0 0 8px;font-weight:600">Hi ${tenantName},</h1>
    <p style="margin:0 0 24px;color:#525049">Your bill for <strong>${period}</strong> is ready.</p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">${rows}
      <tr><td style="padding:14px 0 8px;border-top:2px solid #E5E2D6;font-weight:600">Total Due</td>
          <td style="padding:14px 0 8px;border-top:2px solid #E5E2D6;text-align:right;font-weight:600;font-size:18px">KSh ${total}</td></tr>
      <tr><td style="padding:8px 0;color:#B45309;font-size:13px">Due by</td>
          <td style="padding:8px 0;text-align:right;color:#B45309;font-weight:600">${dueDate}</td></tr>
    </table>

    ${paybillNumber ? `
      <div style="background:#ECFDF5;border:1px solid #D1FAE5;border-radius:8px;padding:16px 18px;margin:0 0 16px">
        <div style="font-size:12px;color:#0F4C3A;text-transform:uppercase;font-weight:600;letter-spacing:.05em;margin-bottom:8px">Pay via M-Pesa</div>
        <table style="width:100%"><tr>
          <td style="padding:4px 0"><strong>Paybill:</strong> ${paybillNumber}</td>
          <td style="padding:4px 0;text-align:right"><strong>Account:</strong> <code style="font-family:monospace;background:#fff;padding:2px 8px;border-radius:4px">${accountNumber}</code></td>
        </tr></table>
      </div>
    ` : ''}

    <p style="margin:24px 0 0;font-size:13px;color:#8A877A">Reach out if you have any questions.</p>
  `;
  return wrap(content, businessName);
}

function receiptTemplate({ tenantName, amount, method, code, date, businessName }) {
  const content = `
    <h1 style="font-size:22px;margin:0 0 8px;font-weight:600">Payment received</h1>
    <p style="margin:0 0 24px;color:#525049">Thank you, ${tenantName}. We've received your payment.</p>

    <div style="background:#F5F4EE;border-radius:8px;padding:20px;margin:0 0 24px;text-align:center">
      <div style="font-size:13px;color:#8A877A;text-transform:uppercase;font-weight:600;letter-spacing:.05em;margin-bottom:6px">Amount paid</div>
      <div style="font-size:36px;font-weight:600;color:#15803D;font-variant-numeric:tabular-nums">KSh ${amount}</div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#525049">Method</td><td style="padding:8px 0;text-align:right">${method}</td></tr>
      ${code ? `<tr><td style="padding:8px 0;color:#525049">Reference</td><td style="padding:8px 0;text-align:right;font-family:monospace">${code}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#525049">Date</td><td style="padding:8px 0;text-align:right">${date}</td></tr>
    </table>
  `;
  return wrap(content, businessName);
}

function reminderTemplate({ tenantName, period, balance, dueDate, daysOverdue, accountNumber, paybillNumber, businessName }) {
  const content = `
    <h1 style="font-size:22px;margin:0 0 8px;font-weight:600">A friendly reminder</h1>
    <p style="margin:0 0 16px;color:#525049">Hi ${tenantName}, your bill for <strong>${period}</strong> is overdue by ${daysOverdue} days.</p>

    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:16px 18px;margin:0 0 24px">
      <div style="font-size:12px;color:#B45309;text-transform:uppercase;font-weight:600;letter-spacing:.05em;margin-bottom:6px">Outstanding balance</div>
      <div style="font-size:24px;font-weight:600;color:#B45309;font-variant-numeric:tabular-nums">KSh ${balance}</div>
      <div style="font-size:13px;color:#8A877A;margin-top:6px">Was due on ${dueDate}</div>
    </div>

    ${paybillNumber ? `
      <div style="background:#ECFDF5;border:1px solid #D1FAE5;border-radius:8px;padding:16px 18px">
        <div style="font-size:12px;color:#0F4C3A;text-transform:uppercase;font-weight:600;letter-spacing:.05em;margin-bottom:8px">Pay via M-Pesa</div>
        <table style="width:100%"><tr>
          <td><strong>Paybill:</strong> ${paybillNumber}</td>
          <td style="text-align:right"><strong>Account:</strong> <code style="font-family:monospace;background:#fff;padding:2px 8px;border-radius:4px">${accountNumber}</code></td>
        </tr></table>
      </div>
    ` : ''}

    <p style="margin:24px 0 0;font-size:13px;color:#8A877A">If you've already paid, please ignore this message.</p>
  `;
  return wrap(content, businessName);
}

module.exports = { sendEmail, billTemplate, receiptTemplate, reminderTemplate };
