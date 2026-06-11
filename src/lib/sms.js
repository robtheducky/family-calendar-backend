const twilio = require('twilio');

let client;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendSms(to, body) {
  return getClient().messages.create({ from: process.env.TWILIO_FROM_NUMBER, to, body });
}

// Post a message to the shared Conversations thread (visible to all participants).
async function postToConversation(body) {
  return getClient().conversations
    .v1.conversations(process.env.TWILIO_CONVERSATION_SID)
    .messages.create({ body, author: 'Puck' });
}

// Send to everyone — uses the Conversation when available, falls back to individual SMS.
async function broadcastSms(body) {
  if (process.env.TWILIO_CONVERSATION_SID) {
    return postToConversation(body);
  }
  const phones = [process.env.FAMILY_PHONE_1, process.env.FAMILY_PHONE_2].filter(Boolean);
  return Promise.all(phones.map((phone) => sendSms(phone, body)));
}

function phoneForEmail(email) {
  const normalized = email?.toLowerCase();
  if (normalized === process.env.FAMILY_EMAIL_1?.toLowerCase()) return process.env.FAMILY_PHONE_1;
  if (normalized === process.env.FAMILY_EMAIL_2?.toLowerCase()) return process.env.FAMILY_PHONE_2;
  return process.env.FAMILY_PHONE_1;
}

function isAuthorizedPhone(phone) {
  if (!phone) return false;
  const p = phone.replace(/\D/g, '');
  const last10 = (n) => n.slice(-10);
  const p1 = (process.env.FAMILY_PHONE_1 || '').replace(/\D/g, '');
  const p2 = (process.env.FAMILY_PHONE_2 || '').replace(/\D/g, '');
  return (p.length >= 10 && last10(p) === last10(p1)) ||
         (p.length >= 10 && last10(p) === last10(p2));
}

function nameForPhone(phone) {
  if (!phone) return 'Unknown';
  const p = phone.replace(/\D/g, '');
  const last10 = (n) => n.slice(-10);
  const p1 = (process.env.FAMILY_PHONE_1 || '').replace(/\D/g, '');
  const p2 = (process.env.FAMILY_PHONE_2 || '').replace(/\D/g, '');
  if (p.length >= 10 && last10(p) === last10(p1)) return 'Rob';
  if (p.length >= 10 && last10(p) === last10(p2)) return 'Maddie';
  return 'Unknown';
}

module.exports = { sendSms, postToConversation, broadcastSms, phoneForEmail, isAuthorizedPhone, nameForPhone };
