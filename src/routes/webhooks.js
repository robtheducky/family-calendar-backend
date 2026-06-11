const { Router } = require('express');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/pool');
const { phoneForEmail, isAuthorizedPhone, nameForPhone, broadcastSms, sendSms } = require('../lib/sms');

const router = Router();
const anthropic = new Anthropic();

const SAVE_EVENT_TOOL = {
  name: 'save_event',
  description: 'Save a calendar event. Call this when the user wants to add something to the calendar.',
  input_schema: {
    type: 'object',
    properties: {
      title:      { type: 'string',           description: 'Name of the event' },
      date:       { type: 'string',           description: 'Date in YYYY-MM-DD format' },
      start_time: { type: ['string', 'null'], description: 'Start time HH:MM 24h, or null' },
      end_time:   { type: ['string', 'null'], description: 'End time HH:MM 24h, or null' },
      location:   { type: ['string', 'null'], description: 'Location, or null' },
      notes:      { type: ['string', 'null'], description: 'Notes, or null' },
      child:      { type: ['string', 'null'], description: 'Who the event is for, or null' },
      driver:     { type: ['string', 'null'], description: 'Who is driving, or null' },
      category:   { type: ['string', 'null'], description: 'school | appointment | sport | playdate | family, or null' },
    },
    required: ['title', 'date'],
  },
};

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

async function getCalendarContext() {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    'SELECT * FROM events WHERE date >= $1 AND date <= $2 ORDER BY date ASC, start_time ASC NULLS LAST',
    [today, twoWeeks]
  );
  if (!rows.length) return 'No upcoming events.';
  return rows.map((ev) => {
    const d = new Date(ev.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    let line = `${d}: ${ev.title}`;
    if (ev.start_time) line += ` at ${formatTime(ev.start_time)}`;
    if (ev.child)  line += ` (${ev.child})`;
    if (ev.driver) line += ` [${ev.driver} driving]`;
    return line;
  }).join('\n');
}

// ─── Incoming Email (Postmark) ────────────────────────────────────────────────
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
    const { parseMessageToEvent } = require('../lib/parser');
    const result = await parseMessageToEvent(`${Subject || ''}\n\n${body}`);

    if (!result || result.name === 'cannot_parse') {
      const msg = result?.data?.response || "Couldn't figure that one out — can you send it again with the date and time?";
      await sendSms(phone, msg);
      return;
    }

    const { title, date, start_time, end_time, location, notes, child, category } = result.data;
    await pool.query(
      `INSERT INTO events (title, date, start_time, end_time, location, notes, child, category, added_by, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'email')`,
      [title, date, start_time || null, end_time || null, location || null, notes || null, child || null, category || null, senderEmail]
    );

    const timePart = formatTime(start_time);
    const text = timePart
      ? `Got it — added "${title}" on ${formatDate(date)} at ${timePart}.`
      : `Got it — added "${title}" on ${formatDate(date)}.`;
    await broadcastSms(text);
  } catch (err) {
    console.error('Email webhook error:', err);
    await sendSms(phone, "Something went wrong on our end — try forwarding that again.");
  }
});

// ─── Incoming SMS / Twilio Conversations ─────────────────────────────────────
//
// When using Twilio Conversations the payload is:
//   Author (phone number), Body, ConversationSid, EventType = "onMessageAdded"
//
// When using plain Twilio SMS the payload is:
//   From (phone number), Body
//
// Both are handled here.
router.post('/sms', express.urlencoded({ extended: false }), async (req, res) => {
  const author = req.body.Author || req.body.From;
  const body   = req.body.Body;
  const event  = req.body.EventType;

  // Conversations fires for ALL messages including Puck's own — ignore them.
  if (event && event !== 'onMessageAdded') return res.status(204).end();
  if (!body || author === 'Puck') return res.status(204).end();
  if (!isAuthorizedPhone(author)) return res.status(204).end();

  // Acknowledge immediately.
  res.status(204).end();

  const senderName = nameForPhone(author);

  try {
    const calendarContext = await getCalendarContext();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      tools: [SAVE_EVENT_TOOL],
      tool_choice: { type: 'auto' },
      system: `You are Puck, a slightly mischievous but highly organized calendar assistant for Rob and Maddie. You're in their shared group text. Be warm, fun, and concise — this is SMS so keep replies short. Use first names. You can save events when asked.

Calendar (next 2 weeks):
${calendarContext}`,
      messages: [{ role: 'user', content: `${senderName}: ${body}` }],
    });

    const toolCall = response.content.find((b) => b.type === 'tool_use');

    if (toolCall?.name === 'save_event') {
      const { title, date, start_time, end_time, location, notes, child, driver, category } = toolCall.input;
      await pool.query(
        `INSERT INTO events (title, date, start_time, end_time, location, notes, child, driver, category, added_by, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sms')`,
        [title, date, start_time || null, end_time || null, location || null, notes || null, child || null, driver || null, category || null, senderName]
      );
      const timePart = start_time ? ` at ${formatTime(start_time)}` : '';
      await broadcastSms(`Done! Added "${title}" on ${formatDate(date)}${timePart}. ✅`);
    } else {
      const textBlock = response.content.find((b) => b.type === 'text');
      await broadcastSms(textBlock?.text?.trim() ?? "Not sure how to help with that one!");
    }
  } catch (err) {
    console.error('SMS webhook error:', err);
    await broadcastSms(`Puck hit a snag — try again in a sec!`);
  }
});

router.post('/sms/fallback', (req, res) => {
  console.error('Twilio fallback hit', req.body);
  res.status(200).send('<Response></Response>');
});

module.exports = router;
