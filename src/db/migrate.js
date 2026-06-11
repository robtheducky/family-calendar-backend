require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id            SERIAL PRIMARY KEY,
        title         TEXT        NOT NULL,
        date          DATE        NOT NULL,
        start_time    TIME,
        end_time      TIME,
        location      TEXT,
        notes         TEXT,
        added_by      TEXT,
        added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source        TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('email', 'manual', 'sms')),
        child         TEXT,
        category      TEXT,
        driver        TEXT,
        recurrence_id UUID
      );
      CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);
    `);

    // Idempotent — safe to run against an existing table
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS child TEXT`);
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT`);
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS driver TEXT`);
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_id UUID`);

    // Update source constraint if it exists (dropping and re-adding is simplest)
    await client.query(`
      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;
      ALTER TABLE events ADD CONSTRAINT events_source_check CHECK (source IN ('email', 'manual', 'sms'));
    `);

    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
