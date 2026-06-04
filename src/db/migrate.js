require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id          SERIAL PRIMARY KEY,
        title       TEXT        NOT NULL,
        date        DATE        NOT NULL,
        start_time  TIME,
        end_time    TIME,
        location    TEXT,
        notes       TEXT,
        added_by    TEXT,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source      TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('email', 'manual'))
      );

      CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);
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
