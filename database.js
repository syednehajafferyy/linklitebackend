const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDb = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to Neon PostgreSQL database.');
    await client.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        original_url TEXT NOT NULL,
        short_code VARCHAR(50) NOT NULL UNIQUE,
        clicks INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL table "urls" verified/created successfully.');
    client.release();
  } catch (err) {
    console.error('Error initializing Neon PostgreSQL database:', err.message);
  }
};

initDb();

module.exports = pool;

