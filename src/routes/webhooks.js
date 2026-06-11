const { Router } = require('express');
const pool = require('../db/pool');
const { parseMessageToEvent } = require('../lib/parser');
const { sendSms, phoneForEmail, isAuthorizedPhone, nameForPhone, broadcastSms } = require('../lib/sms');

const router = Router();

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
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

// ─── Incoming Email (Postmark) ───
router.post('/email', async (req, res) => {
  if (process.env.POSTMARK_WEBHOOK_SECRET) {
    if (req.query.secret !== process.env.POSTMARK_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  res.status(200).json({ received: true });

  const { From, Subject, TextBody, HtmlBody } = req.body;
  const senderEmail = From?.match(/<(.+)>/)?.[1] ?? From ?? '';
  const phone = phoneForEmail(senderEmail);
  const body = TextBody || HtmlBody || '';

  try {
    const result = await parseMessageToEvent(`${Subject || ''}\n\n${body}`);

    if (!result || result.name === 'cannot_parse') {
      const msg = result?.data?.response || "Couldn't figure that one out — can you send it again with the date and time?";
      await sendSms(phone, msg);
      return;
    }

    const { title, date, start_time, end_time, location, notes, child, category } = result.data;

    await pool.query(
      `INSERT INTO events (title, date, start_time, end_time, location, notes, child, category, added_by, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'email')`,
      [title, date, start_time || null, end_time || null, location || null, notes || null, child || null, category || null, senderEmail]
    );

    const timePart = formatTime(start_time);
    const text = timePart
      ? `Got it — Puck has added "${title}" on ${formatDate(date)} at ${timePart}.`
      : `Got it — Puck has added "${title}" on ${formatDate(date)}.`;

    await broadcastSms(text);
  } catch (err) {
    console.error('Email webhook error:', err);
    await sendSms(phone, "Something went wrong on our end — try forwarding that again.");
  }
});

// ─── Incoming SMS (Twilio) ───
router.post('/sms', express.urlencoded({ extended: false }), async (req, res) => {
  const { From, Body } = req.body;

  if (!isAuthorizedPhone(From)) {
    console.log(`Unauthorized SMS from ${From}`);
    return res.status(204).end(); // Silent ignore
  }

  res.status(200).send('<Response></Response>');
  const senderName = nameForPhone(From);

  try {
    const result = await parseMessageToEvent(Body, `The sender is ${senderName}.`);

    if (!result || result.name === 'cannot_parse') {
      const msg = result?.data?.response || `Hmm, I couldn't find an event in that text, ${senderName}. Try including a date and time!`;
      await sendSms(From, msg);
      return;
    }

    const { title, date, start_time, end_time, location, notes, child, category } = result.data;

    await pool.query(
      `INSERT INTO events (title, date, start_time, end_time, location, notes, child, category, added_by, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sms')`,
      [title, date, start_time || null, end_time || null, location || null, notes || null, child || null, category || null, senderName]
    );

    const timePart = formatTime(start_time);
    const text = timePart
      ? `Got it, ${senderName}! Puck has added "${title}" on ${formatDate(date)} at ${timePart}.`
      : `Got it, ${senderName}! Puck has added "${title}" on ${formatDate(date)}.`;

    await broadcastSms(text);
  } catch (err) {
    console.error('SMS webhook error:', err);
    await sendSms(From, "Something went wrong on our end. Try sending that again?");
  }
});

router.post('/sms/fallback', (req, res) => {
  console.error('Twilio hit the fallback URL. Primary SMS handler failed.', req.body);
  res.status(200).send('<Response><Sms>I hit a snag saving that event. My server might be having a moment. Try again in a minute!</Sms></Response>');
});

module.exports = router;
