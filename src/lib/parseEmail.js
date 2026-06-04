const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

const TOOLS = [
  {
    name: 'save_event',
    description: 'Save a calendar event extracted from an email invitation or event notice',
    input_schema: {
      type: 'object',
      properties: {
        title:      { type: 'string',           description: 'Name of the event' },
        date:       { type: 'string',           description: 'Date in YYYY-MM-DD format' },
        start_time: { type: ['string', 'null'], description: 'Start time in HH:MM 24-hour format, or null' },
        end_time:   { type: ['string', 'null'], description: 'End time in HH:MM 24-hour format, or null' },
        location:   { type: ['string', 'null'], description: 'Location or address, or null' },
        notes:      { type: ['string', 'null'], description: 'Relevant logistics (RSVP deadline, what to bring, parking, etc.), or null' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'cannot_parse',
    description: 'Use when the email has no clear event with at least a title and date',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
];

async function parseEmailToEvent(subject, body) {
  // Trim body to keep tokens reasonable
  const trimmedBody = body.slice(0, 4000);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: `Extract the calendar event from this email. If it contains a clear event with at least a title and date, call save_event. Otherwise call cannot_parse.\n\nSubject: ${subject}\n\n${trimmedBody}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.name === 'cannot_parse') return null;
  return toolUse.input;
}

module.exports = { parseEmailToEvent };
