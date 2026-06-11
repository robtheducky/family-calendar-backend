require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const eventsRouter = require('./routes/events');
const webhooksRouter = require('./routes/webhooks');
const { sendWeeklyBrief, sendDailyBrief } = require('./lib/briefs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/events', eventsRouter);
app.use('/webhooks', webhooksRouter);

// Manual triggers for testing
app.post('/admin/send-brief', async (req, res) => {
  try {
    const brief = await sendWeeklyBrief();
    res.json({ sent: true, brief });
  } catch (err) {
    console.error('Failed to send weekly brief:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/send-daily', async (req, res) => {
  try {
    const brief = await sendDailyBrief();
    res.json({ sent: !!brief, brief });
  } catch (err) {
    console.error('Failed to send daily brief:', err);
    res.status(500).json({ error: err.message });
  }
});

// Every day at 7:00 AM Eastern
cron.schedule('0 7 * * *', () => {
  console.log('Running daily morning brief...');
  sendDailyBrief().catch((err) => console.error('Daily brief failed:', err));
}, { timezone: 'America/New_York' });

// Every Friday at 8:00 AM Eastern
cron.schedule('0 8 * * 5', () => {
  console.log('Running Friday morning brief...');
  sendWeeklyBrief().catch((err) => console.error('Weekly brief failed:', err));
}, { timezone: 'America/New_York' });

app.listen(PORT, () => {
  console.log(`Family calendar API running on port ${PORT}`);
});
