const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/pool');
const { sendSms } = require('./sms');

const anthropic = new Anthropic();

function formatEventLine(event) {
  const date = new Date(
    ...event.date.toISOString().slice(0, 10).split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n)
  );
  const dayStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  let line = `- ${dayStr}: ${event.title}`;
  if (event.start_time) {
    const [h, m] = event.start_time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    line += ` at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  if (event.child) line += ` for ${event.child}`;
  if (event.driver) {
    line += ` (Driver: ${event.driver})`;
  } else if (event.child && event.category !== 'family') {
    line += ` (NEEDS DRIVER)`;
  }
  if (event.location) line += ` @ ${event.location}`;
  if (event.notes) line += ` [Notes: ${event.notes}]`;
  return line;
}

async function sendWeeklyBrief() {
  const today = new Date();
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(today.getDate() + 7);

  const from = today.toISOString().slice(0, 10);
  const to = sevenDaysOut.toISOString().slice(0, 10);

  const { rows: events } = await pool.query(
    'SELECT * FROM events WHERE date >= $1 AND date <= $2 ORDER BY date ASC, start_time ASC NULLS LAST',
    [from, to]
  );

  const eventsList = events.length > 0
    ? events.map(formatEventLine).join('\n')
    : 'No events on the calendar.';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are Puck, the Martin family's helpful, slightly mischievous, but highly organized calendar assistant. Write a Friday morning heads-up text about the upcoming week. Write it like a warm, helpful friend — not a scheduler. Flowing sentences, no bullet points or lists. Flag anything that needs coordination (overlapping times, nobody assigned to drive, etc.). Keep it under 400 characters so it's easy to read on a phone. If the week is empty, say so warmly.

Upcoming events (next 7 days):
${eventsList}`,
      },
    ],
  });

  const brief = response.content[0].text.trim();
  const phones = [process.env.FAMILY_PHONE_1, process.env.FAMILY_PHONE_2].filter(Boolean);
  await Promise.all(phones.map((phone) => sendSms(phone, brief)));

  console.log(`Weekly brief sent to ${phones.length} number(s):\n${brief}`);
  return brief;
}

async function sendDailyBrief() {
  const todayKey = new Date().toISOString().slice(0, 10);

  const { rows: events } = await pool.query(
    'SELECT * FROM events WHERE date = $1 ORDER BY start_time ASC NULLS LAST',
    [todayKey]
  );

  if (events.length === 0) return null; // Don't send a morning text if it's an empty day

  const eventsList = events.map(formatEventLine).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `You are Puck, the Martin family's helpful calendar assistant. Write a quick "good morning" text for today. Keep it very short, punchy, and helpful. Mention the specific events for today. One or two sentences max. No lists.

Today's events:
${eventsList}`,
      },
    ],
  });

  const brief = response.content[0].text.trim();
  const phones = [process.env.FAMILY_PHONE_1, process.env.FAMILY_PHONE_2].filter(Boolean);
  await Promise.all(phones.map((phone) => sendSms(phone, brief)));

  console.log(`Daily brief sent to ${phones.length} number(s):\n${brief}`);
  return brief;
}

module.exports = { sendWeeklyBrief, sendDailyBrief };
