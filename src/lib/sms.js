const twilio = require('twilio');

let client;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendSms(to, body) {
  return getClient().messages.create({ from: process.env.TWILIO_FROM_NUMBER, to, body });
}

async function broadcastSms(body) {
  const phones = [process.env.FAMILY_PHONE_1, process.env.FAMILY_PHONE_2].filter(Boolean);
  return Promise.all(phones.map(phone => sendSms(phone, body)));
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
  const p1 = (process.env.FAMILY_PHONE_1 || '').replace(/\D/g, '');
  const p2 = (process.env.FAMILY_PHONE_2 || '').replace(/\D/g, '');
  
  // Match if the last 10 digits are the same (handles country code issues)
  const last10 = (num) => num.slice(-10);
  return (p.length >= 10 && last10(p) === last10(p1)) || 
         (p.length >= 10 && last10(p) === last10(p2));
}

function nameForPhone(phone) {
  const p = phone.replace(/\D/g, '');
  const p1 = process.env.FAMILY_PHONE_1?.replace(/\D/g, '');
  const p2 = process.env.FAMILY_PHONE_2?.replace(/\D/g, '');
  if (p === p1) return 'Rob';
  if (p === p2) return 'Maddie';
  return 'Unknown';
}

module.exports = { sendSms, phoneForEmail, isAuthorizedPhone, nameForPhone };
