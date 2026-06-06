const { Router } = require('express');
const { randomUUID } = require('crypto');
const pool = require('../db/pool');

const router = Router();

// GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { from, to } = req.query;

  let query = 'SELECT * FROM events';
  const params = [];

  if (from && to) {
    query += ' WHERE date >= $1 AND date <= $2';
    params.push(from, to);
  } else if (from) {
    query += ' WHERE date >= $1';
    params.push(from);
  } else if (to) {
    query += ' WHERE date <= $1';
    params.push(to);
  }

  query += ' ORDER BY date ASC, start_time ASC NULLS LAST';

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /events
// repeat_weeks > 1 creates that many weekly instances sharing a recurrence_id
router.post('/', async (req, res) => {
  const {
    title, date, start_time, end_time, location, notes,
    added_by, source, child, category, driver, repeat_weeks,
  } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: 'title and date are required' });
  }

  const weeks = Math.min(Math.max(parseInt(repeat_weeks) || 1, 1), 52);

  try {
    if (weeks === 1) {
      const { rows } = await pool.query(
        `INSERT INTO events
           (title, date, start_time, end_time, location, notes, added_by, source, child, category, driver)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          title, date,
          start_time || null, end_time || null,
          location || null, notes || null,
          added_by || null, source || 'manual',
          child || null, category || null, driver || null,
        ]
      );
      return res.status(201).json(rows[0]);
    }

    const recurrenceId = randomUUID();
    const inserted = [];
    const [y, m, d] = date.split('-').map(Number);

    for (let i = 0; i < weeks; i++) {
      const eventDate = new Date(y, m - 1, d + i * 7);
      const dateStr = eventDate.toISOString().slice(0, 10);
      const { rows } = await pool.query(
        `INSERT INTO events
           (title, date, start_time, end_time, location, notes, added_by, source, child, category, driver, recurrence_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          title, dateStr,
          start_time || null, end_time || null,
          location || null, notes || null,
          added_by || null, source || 'manual',
          child || null, category || null, driver || null,
          recurrenceId,
        ]
      );
      inserted.push(rows[0]);
    }

    res.status(201).json(inserted);
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// DELETE /events/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Event not found' });
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /events error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = router;
