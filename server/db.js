const { Pool } = require('pg');
async function database(env) {
  if (env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
    pool.on('error', e => console.error('Database connection:', e.message));
    return pool;
  }
  if (env.DEMO_MODE !== 'true') throw Error('DATABASE_URL is required outside demo mode');
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite(env.DEMO_DATA_DIR || './data/demo');
  await db.waitReady;
  // Queue entire transactions: the embedded demo database has one connection.
  let tail = Promise.resolve();
  async function acquire() {
    const before = tail; let release;
    tail = new Promise(r => { release = r; });
    await before;
    return { query: async (...args) => {
      const r = await db.query(...args); return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
    }, release };
  }
  return { connect: acquire, query: async (...args) => {
    const c = await acquire(); try { return await c.query(...args); } finally { c.release(); }
  }, end: () => db.close() };
}
async function migrate(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL DEFAULT '',
      crystals INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_daily_bonus DATE)`);
    await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus DATE');
    await c.query(`CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, seller_name TEXT NOT NULL,
      brand TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL, price NUMERIC NOT NULL,
      description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'black', slot_id INTEGER,
      zone INTEGER NOT NULL DEFAULT 1, spot INTEGER, status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const column of ['color TEXT NOT NULL DEFAULT \'black\'', 'slot_id INTEGER',
      'zone INTEGER NOT NULL DEFAULT 1', 'spot INTEGER', 'expires_at TIMESTAMPTZ',
      "body_type TEXT NOT NULL DEFAULT 'sedan'"]) await c.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS ${column}`);
    await c.query(`UPDATE listings SET expires_at=created_at + INTERVAL '24 hours' WHERE expires_at IS NULL`);
    await c.query(`ALTER TABLE listings ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '24 hours')`);
    await c.query('ALTER TABLE listings ALTER COLUMN expires_at SET NOT NULL');
    await c.query(`UPDATE listings SET slot_id=COALESCE(slot_id, spot), spot=COALESCE(spot, slot_id)`);
    await c.query(`UPDATE listings SET status='expired' WHERE status='active' AND expires_at<=NOW()`);
    await c.query(`UPDATE listings SET status='removed' WHERE status='active' AND (slot_id IS NULL OR slot_id NOT BETWEEN 1 AND 100)`);
    await c.query(`UPDATE listings SET status='removed' WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY slot_id ORDER BY created_at,id) n
      FROM listings WHERE status='active') d WHERE n>1)`);
    await c.query('DROP INDEX IF EXISTS unique_active_listing_per_seller');
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot ON listings(slot_id) WHERE status='active'`);
    await c.query(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, listing_title TEXT NOT NULL,
      from_user_id TEXT NOT NULL, from_name TEXT NOT NULL, to_user_id TEXT NOT NULL,
      text TEXT NOT NULL, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await c.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id TEXT');
    await c.query('CREATE UNIQUE INDEX IF NOT EXISTS message_client_id ON messages(from_user_id,client_id)');
    await c.query('CREATE INDEX IF NOT EXISTS messages_recipient ON messages(to_user_id,created_at)');
    await c.query(`CREATE TABLE IF NOT EXISTS seller_ratings (
      seller_id TEXT NOT NULL, rater_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(seller_id,rater_id))`);
    await c.query(`CREATE TABLE IF NOT EXISTS notification_outbox (
      id TEXT PRIMARY KEY, recipient TEXT NOT NULL, text TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending', last_error TEXT)`);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
module.exports = { database, migrate };
