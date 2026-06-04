const { Router } = require('express');
const pool = require('../db/pool');
const { parseEmailToEvent } = require('../lib/parseEmail');
const { sendSms, phoneForEmail } = require('../lib/sms');

const router = Router();

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use noon local time to avoid date shifting across timezone boundaries
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

router.post('/email', async (req, res) => {
  if (process.env.POSTMARK_WEBHOOK_SECRET) {
    if (req.query.secret !== process.env.POSTMARK_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Acknowledge immediately — Postmark retries if it doesn't get a 200 quickly
  res.status(200).json({ received: true });

  const { From, Subject, TextBody, HtmlBody } = req.body;
  const senderEmail = From?.match(/<(.+)>/)?.[1] ?? From ?? '';
  const phone = phoneForEmail(senderEmail);
  const body = TextBody || HtmlBody || '';

  try {
    const event = await parseEmailToEvent(Subject || '', body);

    if (!event) {
      await sendSms(phone, "Couldn't figure that one out — can you send it again with the date and time?");
      return;
    }

    const { title, date, start_time, end_time, location, notes } = event;

    await pool.query(
      `INSERT INTO events (title, date, start_time, end_time, location, notes, added_by, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'email')`,
      [title, date, start_time || null, end_time || null, location || null, notes || null, senderEmail]
    );

    const timePart = formatTime(start_time);
    const text = timePart
      ? `Got it — added "${title}" on ${formatDate(date)} at ${timePart}.`
      : `Got it — added "${title}" on ${formatDate(date)}.`;

    await sendSms(phone, text);
  } catch (err) {
    console.error('Webhook processing error:', err);
    try {
      await sendSms(phone, "Something went wrong on our end — try forwarding that again.");
    } catch (smsErr) {
      console.error('Failed to send error SMS:', smsErr);
    }
  }
});

module.exports = router;
