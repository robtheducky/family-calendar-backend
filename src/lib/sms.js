const twilio = require('twilio');

let client;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendSms(to, body) {
  return getClient().messages.create({ from: process.env.TWILIO_FROM_NUMBER, to, body });
}

function phoneForEmail(email) {
  const normalized = email?.toLowerCase();
  if (normalized === process.env.FAMILY_EMAIL_1?.toLowerCase()) return process.env.FAMILY_PHONE_1;
  if (normalized === process.env.FAMILY_EMAIL_2?.toLowerCase()) return process.env.FAMILY_PHONE_2;
  return process.env.FAMILY_PHONE_1;
}

module.exports = { sendSms, phoneForEmail };
