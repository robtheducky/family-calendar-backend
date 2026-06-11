const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

const TOOLS = [
  {
    name: 'save_event',
    description: 'Save a calendar event extracted from a message or email',
    input_schema: {
      type: 'object',
      properties: {
        title:      { type: 'string',           description: 'Name of the event' },
        date:       { type: 'string',           description: 'Date in YYYY-MM-DD format. If no year is provided, assume the current or upcoming occurrence.' },
        start_time: { type: ['string', 'null'], description: 'Start time in HH:MM 24-hour format, or null' },
        end_time:   { type: ['string', 'null'], description: 'End time in HH:MM 24-hour format, or null' },
        location:   { type: ['string', 'null'], description: 'Location or address, or null' },
        notes:      { type: ['string', 'null'], description: 'Relevant logistics (RSVP deadline, what to bring, parking, etc.), or null' },
        child:      { type: ['string', 'null'], description: 'Who the event is for (e.g., "Liam", "Mia", "Rob", "Maddie").' },
        category:   { type: ['string', 'null'], description: 'The category of the event. Must be one of: school, appointment, sport, playdate, family.' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'cannot_parse',
    description: 'Use when the message has no clear event with at least a title and date. Provide a friendly, conversational response if the user is just greeting you or chatting.',
    input_schema: {
      type: 'object',
      properties: { 
        reason: { type: 'string', description: 'Why it couldnt be parsed' },
        response: { type: 'string', description: 'A friendly message back to the user (e.g., "Hi Rob! Ready to add some events?")' }
      },
      required: ['reason'],
    },
  },
];

async function parseMessageToEvent(content, context = '') {
  const trimmedContent = content.slice(0, 4000);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: `Extract the calendar event from this message. If it contains a clear event with at least a title and date, call save_event. Otherwise call cannot_parse.\n\nContext: ${context}\n\nMessage:\n${trimmedContent}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) return null;
  
  return {
    name: toolUse.name,
    data: toolUse.input
  };
}

module.exports = { parseMessageToEvent };
