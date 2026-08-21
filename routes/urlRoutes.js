const express = require('express');
const { nanoid } = require('nanoid');
const pool = require('../database');

const router = express.Router();

// Helper to get BASE_URL dynamically
const getBaseUrl = (req) => {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
};


// Health-check route at GET /
router.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'LinkLite API is operational', timestamp: new Date().toISOString() });
});

// GET /api/health
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LinkLite API is operational', timestamp: new Date().toISOString() });
});

// GET /api/links - Get all shortened links ordered by id DESC directly from PostgreSQL
router.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, original_url, short_code, COALESCE(clicks, 0) AS clicks, created_at FROM urls ORDER BY id DESC');
    const BASE_URL = getBaseUrl(req);
    const links = result.rows.map((row) => ({
      id: row.id,
      short_code: row.short_code,
      shortCode: row.short_code,
      original_url: row.original_url,
      originalUrl: row.original_url,
      clicks: Number(row.clicks || 0),
      created_at: row.created_at,
      createdAt: row.created_at,
      shortUrl: `${BASE_URL}/${row.short_code}`
    }));
    res.json(links);
  } catch (err) {
    console.error('GET /api/links error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/links/:shortCode - Delete a short link from PostgreSQL database
router.delete('/api/links/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  console.log(`DELETE REQUEST RECEIVED: ${shortCode}`);

  try {
    const result = await pool.query('DELETE FROM urls WHERE short_code = $1', [shortCode]);
    if (result.rowCount === 0) {
      console.log(`DELETE FAILED: Short code "${shortCode}" not found`);
      return res.status(404).json({ error: 'Short link not found' });
    }
    console.log(`POSTGRES DELETE SUCCESS: short_code="${shortCode}"`);
    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (err) {
    console.error('DELETE POSTGRES ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shorten - Shorten a long URL and insert row into PostgreSQL urls table
router.post('/api/shorten', async (req, res) => {
  const { originalUrl } = req.body;
  console.log('CREATE REQUEST RECEIVED:', originalUrl);

  if (!originalUrl || typeof originalUrl !== 'string' || !originalUrl.trim()) {
    console.log('CREATE FAILED: URL is required');
    return res.status(400).json({ error: 'URL is required' });
  }

  let formattedUrl = originalUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'http://' + formattedUrl;
  }

  const BASE_URL = getBaseUrl(req);
  const shortCode = nanoid(6);

  console.log(`ATTEMPTING POSTGRES INSERT: original_url="${formattedUrl}", short_code="${shortCode}"`);

  try {
    const result = await pool.query(
      'INSERT INTO urls (original_url, short_code, clicks) VALUES ($1, $2, 0) RETURNING id, created_at',
      [formattedUrl, shortCode]
    );
    const row = result.rows[0];
    console.log(`POSTGRES INSERT SUCCESS: id=${row.id}, short_code="${shortCode}"`);
    res.status(201).json({
      shortCode,
      shortUrl: `${BASE_URL}/${shortCode}`,
      originalUrl: formattedUrl,
      clicks: 0,
      createdAt: row.created_at || new Date().toISOString()
    });
  } catch (insertErr) {
    console.error('CREATE POSTGRES INSERT ERROR:', insertErr.message);
    res.status(500).json({ error: insertErr.message });
  }
});

// GET /api/stats/:shortCode - Analytics API
router.get('/api/stats/:shortCode', async (req, res) => {
  const { shortCode } = req.params;
  const BASE_URL = getBaseUrl(req);

  try {
    const result = await pool.query('SELECT id, original_url, short_code, COALESCE(clicks, 0) AS clicks, created_at FROM urls WHERE short_code = $1', [shortCode]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    const row = result.rows[0];
    res.json({
      originalUrl: row.original_url,
      shortCode: row.short_code,
      shortUrl: `${BASE_URL}/${row.short_code}`,
      clicks: Number(row.clicks || 0),
      createdAt: row.created_at
    });
  } catch (err) {
    console.error('GET /api/stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /favicon.ico - Filter out browser favicon requests
router.get('/favicon.ico', (req, res) => res.status(204).end());

// GET /:shortCode - Redirect System with PostgreSQL click increment
router.get('/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  if (shortCode === 'favicon.ico') {
    return res.status(204).end();
  }

  try {
    const result = await pool.query('SELECT id, original_url, short_code, COALESCE(clicks, 0) AS clicks FROM urls WHERE short_code = $1', [shortCode]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const row = result.rows[0];
    // Increment click count directly in PostgreSQL database
    await pool.query('UPDATE urls SET clicks = COALESCE(clicks, 0) + 1 WHERE short_code = $1', [shortCode]).catch((updateErr) => {
      console.error('Error updating click count in PostgreSQL:', updateErr.message);
    });

    res.redirect(302, row.original_url);
  } catch (err) {
    console.error('GET /:shortCode redirect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

