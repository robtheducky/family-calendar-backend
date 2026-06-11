// One-time script to create the Twilio Conversation and add Rob and Maddie.
// Run once: node setup-conversation.js
// Then add TWILIO_CONVERSATION_SID to Railway environment variables.

require('dotenv').config();
const twilio = require('twilio');

const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'FAMILY_PHONE_1', 'FAMILY_PHONE_2'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const BACKEND_URL = process.env.BACKEND_URL || 'https://family-calendar-backend-production.up.railway.app';

async function setup() {
  console.log('Creating conversation...');
  const conversation = await client.conversations.v1.conversations.create({
    friendlyName: 'Rob, Maddie & Puck',
  });
  console.log(`✓ Conversation created: ${conversation.sid}`);

  console.log('Adding Rob...');
  await client.conversations.v1.conversations(conversation.sid)
    .participants.create({
      'messagingBinding.address':      process.env.FAMILY_PHONE_1,
      'messagingBinding.proxyAddress': process.env.TWILIO_FROM_NUMBER,
    });
  console.log('✓ Rob added');

  console.log('Adding Maddie...');
  await client.conversations.v1.conversations(conversation.sid)
    .participants.create({
      'messagingBinding.address':      process.env.FAMILY_PHONE_2,
      'messagingBinding.proxyAddress': process.env.TWILIO_FROM_NUMBER,
    });
  console.log('✓ Maddie added');

  console.log('Configuring webhook...');
  await client.conversations.v1.configuration.webhooks().update({
    postWebhookUrl: `${BACKEND_URL}/webhooks/sms`,
    filters: ['onMessageAdded'],
  });
  console.log(`✓ Webhook set → ${BACKEND_URL}/webhooks/sms`);

  console.log(`
✅ Done! Add this to Railway environment variables:

   TWILIO_CONVERSATION_SID=${conversation.sid}

Then both Rob and Maddie will receive a welcome text from the toll-free number.
`);

  // Send a welcome message to kick off the thread
  await client.conversations.v1.conversations(conversation.sid)
    .messages.create({
      body: "Hey Rob and Maddie! 👋 Puck here — your family calendar assistant. Text me anything: add events, ask what's coming up, or just say hi. I'm watching the calendar so you don't have to.",
      author: 'Puck',
    });
  console.log('✓ Welcome message sent');
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
