require('dotenv').config();
const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        console.log(`${method} ${path} → ${res.statusCode}`);
        try { console.log(JSON.parse(raw)); } catch { console.log(raw); }
        resolve(res.statusCode);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const step = process.argv[2] || 'all';

  if (step === 'all' || step === '1') {
    console.log('\n--- Step 1: CRUD ---');
    await request('GET', '/health');
    await request('POST', '/events', {
      title: 'Soccer game', date: '2026-06-07', start_time: '10:00', location: 'Riverside Park',
    });
    await request('GET', '/events?from=2026-06-01&to=2026-06-30');
  }

  if (step === 'all' || step === '3') {
    console.log('\n--- Step 3: Friday brief (takes ~5s for Claude + SMS) ---');
    await request('POST', '/admin/send-brief');
    console.log('(SMS brief should arrive on your phone within a few seconds)');
  }

  if (step === 'all' || step === '2') {
    console.log('\n--- Step 2: Email webhook (takes ~5s for Claude + SMS) ---');
    const secret = process.env.POSTMARK_WEBHOOK_SECRET || '';
    await request('POST', `/webhooks/email?secret=${secret}`, {
      From: `${process.env.FAMILY_EMAIL_1}`,
      Subject: "Birthday party for Emma!",
      TextBody: "Hey! We're throwing a birthday party for Emma on Saturday June 13th at 3pm. It'll be at our place — 42 Maple Street. Please RSVP by June 10th. Can't wait to see you!",
    });
    console.log('(SMS confirmation should arrive on your phone within a few seconds)');
    // Give async processing time to complete
    await new Promise((r) => setTimeout(r, 8000));
    console.log('\nEvents after webhook:');
    await request('GET', '/events?from=2026-06-01&to=2026-06-30');
  }
}

run().catch(console.error);
