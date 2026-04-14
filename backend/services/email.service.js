import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { generateBriefing } from './gemini.service.js';

// In-memory per-delivery cooldown to avoid email spam (at least 15 min between alerts)
const emailCooldowns = new Map();
const EMAIL_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

function isEmailOnCooldown(deliveryId) {
  const last = emailCooldowns.get(String(deliveryId));
  return last && Date.now() - last < EMAIL_COOLDOWN_MS;
}

function setEmailCooldown(deliveryId) {
  emailCooldowns.set(String(deliveryId), Date.now());
}

// Build the Gmail transporter from ENV credentials
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.emailUser,
      pass: config.emailPass, // App Password (not your Gmail password)
    },
  });
}

/**
 * Generate a rich, Gemini-powered HTML alert email body.
 */
async function buildEmailContent(delivery, prediction, rerouteInfo) {
  const contextForGemini = [{
    truckId: delivery.truckId,
    origin: delivery.origin,
    destinations: delivery.destinations,
    status: delivery.status,
    riskScore: prediction.risk_score,
    delayProbability: prediction.delay_probability,
    expectedDelayMinutes: prediction.expected_delay_minutes,
    currentLocation: delivery.currentLocation,
    rerouteApplied: rerouteInfo?.reRouted || false,
    obstacles: rerouteInfo?.obstacles || [],
  }];

  // Ask Gemini for a professional advisory brief
  let geminiAdvice = '';
  try {
    geminiAdvice = await generateBriefing(contextForGemini);
  } catch (e) {
    geminiAdvice = 'AI advisory unavailable at this time.';
  }

  const riskColor = prediction.risk_score >= 90 ? '#dc2626' : '#f59e0b';
  const statusBadge = prediction.risk_score >= 90 ? 'CRITICAL' : 'HIGH RISK';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Supply Chain Risk Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
        
        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 60%,#4f46e5 100%);padding:36px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#a5b4fc;text-transform:uppercase;margin-bottom:6px;">Smart Supply Chain</div>
                  <h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;line-height:1.2;">🚨 Risk Alert Notification</h1>
                  <p style="margin:10px 0 0;color:#c7d2fe;font-size:14px;">Automated AI-Powered Logistics Alert System</p>
                </td>
                <td align="right">
                  <div style="background:${riskColor};color:#fff;font-size:13px;font-weight:800;padding:8px 18px;border-radius:99px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;">${statusBadge}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- RISK SCORE BANNER -->
        <tr>
          <td style="background:${riskColor};padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#fff;font-size:13px;font-weight:600;opacity:0.85;">AI Risk Score</div>
                  <div style="color:#fff;font-size:42px;font-weight:900;line-height:1;">${Math.round(prediction.risk_score)}%</div>
                </td>
                <td align="right">
                  <div style="color:#fff;font-size:13px;font-weight:600;opacity:0.85;">Delay Probability</div>
                  <div style="color:#fff;font-size:28px;font-weight:800;">${Math.round(prediction.delay_probability * 100)}%</div>
                  <div style="color:#fff;font-size:12px;opacity:0.75;margin-top:4px;">Expected: +${Math.round(prediction.expected_delay_minutes)} min</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td style="padding:36px 40px;">

            <!-- Shipment Details -->
            <h2 style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1e1b4b;border-bottom:2px solid #e0e7ff;padding-bottom:10px;">📦 Shipment Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
              <tr>
                <td style="padding:8px 0;font-size:13px;color:#6b7280;width:40%;font-weight:500;">Truck ID</td>
                <td style="padding:8px 0;font-size:13px;color:#111827;font-weight:700;">${delivery.truckId}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Origin</td>
                <td style="padding:8px 0;font-size:13px;color:#111827;">${delivery.origin}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Destination(s)</td>
                <td style="padding:8px 0;font-size:13px;color:#111827;">${(delivery.destinations || []).join(', ')}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Current Status</td>
                <td style="padding:8px 0;font-size:13px;font-weight:700;color:${riskColor};">${delivery.status?.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Current Location (lat, lng)</td>
                <td style="padding:8px 0;font-size:13px;color:#111827;font-family:monospace;">${delivery.currentLocation?.lat?.toFixed(5)}, ${delivery.currentLocation?.lng?.toFixed(5)}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Alert Time</td>
                <td style="padding:8px 0;font-size:13px;color:#111827;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td>
              </tr>
            </table>

            <!-- Re-Route Info -->
            ${rerouteInfo?.reRouted ? `
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
              <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:6px;">✅ Auto Re-Route Applied</div>
              <div style="font-size:13px;color:#166534;">System has automatically computed an optimized alternate route to avoid congestion and delay signals.</div>
              ${rerouteInfo.obstacles?.length ? `<div style="font-size:12px;color:#15803d;margin-top:8px;font-family:monospace;">Avoided: ${rerouteInfo.obstacles.join(', ')}</div>` : ''}
            </div>
            ` : `
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
              <div style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;">⚠️ Manual Review Required</div>
              <div style="font-size:13px;color:#78350f;">Automatic re-routing was not triggered. Please review the route and intervene manually from the dashboard.</div>
            </div>
            `}

            <!-- Gemini AI Advisory -->
            <h2 style="margin:0 0 14px;font-size:16px;font-weight:700;color:#1e1b4b;border-bottom:2px solid #e0e7ff;padding-bottom:10px;">🤖 Gemini AI Advisory</h2>
            <div style="background:#f5f3ff;border-left:4px solid #6d28d9;border-radius:0 10px 10px 0;padding:20px 24px;margin-bottom:28px;font-size:13px;line-height:1.8;color:#374151;white-space:pre-wrap;">${geminiAdvice.replace(/\*\*/g, '').replace(/#{1,3}\s/g, '').replace(/\*/g, '•')}</div>

            <!-- What to do next -->
            <h2 style="margin:0 0 14px;font-size:16px;font-weight:700;color:#1e1b4b;border-bottom:2px solid #e0e7ff;padding-bottom:10px;">📋 Immediate Action Items</h2>
            <ul style="margin:0 0 28px;padding:0 0 0 20px;font-size:13px;color:#374151;line-height:2;">
              <li>Log into the <strong>Smart Supply Dashboard</strong> to view the live map tracking</li>
              <li>Review the updated optimized route in the active shipments panel</li>
              <li>Coordinate with the driver (Truck ID: <strong>${delivery.truckId}</strong>) on new route instructions</li>
              <li>Monitor the ETA corrections for downstream delivery schedule adjustments</li>
              <li>If risk persists above 90%, consider dispatching a secondary vehicle</li>
            </ul>
            
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1e1b4b;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a5b4fc;">This is an automated notification from the <strong style="color:#fff;">Smart Supply Chain</strong> AI system.</p>
            <p style="margin:8px 0 0;font-size:11px;color:#6d72bc;">Do not reply to this email. Log into your dashboard to take action.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
SMART SUPPLY CHAIN — RISK ALERT
================================
Truck: ${delivery.truckId}
Risk Score: ${Math.round(prediction.risk_score)}%
Status: ${delivery.status?.toUpperCase()}
Route: ${delivery.origin} → ${(delivery.destinations || []).join(' → ')}
Re-Route Applied: ${rerouteInfo?.reRouted ? 'Yes' : 'No'}

AI ADVISORY:
${geminiAdvice.replace(/[*#]/g, '').trim()}

Log in to your dashboard to take action immediately.
  `.trim();

  return { html, text };
}

/**
 * Send a risk alert email to the delivery manager.
 * @param {object} delivery - Enriched delivery state from Redis/DB
 * @param {object} prediction - ML prediction output { risk_score, delay_probability, expected_delay_minutes }
 * @param {string} managerEmail - Email address of the manager who created this route
 * @param {object} rerouteInfo - Result from optimizeAndReRoute
 */
export async function sendRiskAlertEmail(delivery, prediction, managerEmail, rerouteInfo = {}) {
  if (!config.emailUser || !config.emailPass) {
    console.warn('[Email] EMAIL_USER or EMAIL_PASS not configured. Skipping alert.');
    return;
  }

  if (!managerEmail) {
    console.warn('[Email] No manager email found for delivery', delivery.truckId);
    return;
  }

  if (isEmailOnCooldown(delivery._id)) {
    return; // Silently skip — already alerted recently
  }

  try {
    const { html, text } = await buildEmailContent(delivery, prediction, rerouteInfo);
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Smart Supply Chain AI" <${config.emailUser}>`,
      to: managerEmail,
      subject: `🚨 [${Math.round(prediction.risk_score)}% Risk] Truck ${delivery.truckId} Needs Attention — ${delivery.origin}`,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    setEmailCooldown(delivery._id);
    console.log(`[Email]  Risk alert sent to ${managerEmail} for ${delivery.truckId} (${info.messageId})`);
  } catch (err) {
    console.error('[Email]  Failed to send risk alert:', err.message);
  }
}
