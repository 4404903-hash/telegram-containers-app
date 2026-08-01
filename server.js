const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const DEMO_MODE = String(process.env.DEMO_MODE || 'true') === 'true';
const VIP_PRICE = 10;
const VIP_SLOTS = 5;
const TOTAL_SLOTS = 30;

if (!DATABASE_URL) {
  console.error('Помилка: DATABASE_URL не налаштована');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (error) => console.error('PostgreSQL error:', error));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.get('/version', (_req, res) => res.json({ version: '6.1.0', build: '50-large-slots-menu-office-bonus' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      crystals INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_daily_bonus DATE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      price NUMERIC NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'black',
      slot_id INTEGER,
      zone INTEGER NOT NULL DEFAULT 1,
      spot INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'black'`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS slot_id INTEGER`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS zone INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS spot INTEGER`);

  await pool.query(`
    UPDATE listings
    SET slot_id = COALESCE(slot_id, spot, ((zone - 1) * 20) + 1),
        spot = COALESCE(spot, slot_id)
    WHERE slot_id IS NULL OR spot IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      listing_title TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`DROP INDEX IF EXISTS unique_active_listing_per_seller`);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot
    ON listings (slot_id) WHERE status = 'active'
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS messages_users_idx ON messages (from_user_id, to_user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS messages_listing_idx ON messages (listing_id)`);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus DATE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seller_ratings (
      seller_id TEXT NOT NULL,
      rater_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (seller_id, rater_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS seller_ratings_seller_idx ON seller_ratings (seller_id)`);


  console.log('PostgreSQL підключено. Таблиці AutoBazar v6.1 готові');
}

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

function mapListing(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    brand: row.brand,
    model: row.model,
    year: Number(row.year),
    price: Number(row.price),
    description: row.description,
    color: row.color,
    slotId: Number(row.slot_id),
    spot: Number(row.slot_id),
    zone: 1,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    fromUserId: row.from_user_id,
    fromName: row.from_name,
    toUserId: row.to_user_id,
    text: row.text,
    read: row.is_read,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const onlineUsers = new Map();
const onlinePlayers = new Map();

async function ensureUser(user) {
  const initialCrystals = DEMO_MODE ? 30 : 0;
  const result = await pool.query(`
    INSERT INTO users (id, name, username, crystals)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          username = EXCLUDED.username,
          updated_at = NOW()
    RETURNING crystals
  `, [user.id, user.name, user.username || '', initialCrystals]);
  return { crystals: Number(result.rows[0].crystals) };
}

async function getPublicListings() {
  const result = await pool.query(`
    SELECT l.*, COALESCE(AVG(sr.rating),0) AS seller_rating, COUNT(sr.rating)::int AS rating_count
    FROM listings l
    LEFT JOIN seller_ratings sr ON sr.seller_id=l.seller_id
    WHERE l.status='active'
    GROUP BY l.id
    ORDER BY l.slot_id ASC
  `);
  return result.rows.map(row => ({ ...mapListing(row), sellerOnline: onlineUsers.has(String(row.seller_id)), sellerRating: Number(row.seller_rating), ratingCount: Number(row.rating_count) }));
}


function getPublicPlayers() {
  return [...onlinePlayers.values()].map(({ socketId, ...player }) => player);
}

async function getUserMessages(userId) {
  const result = await pool.query(`
    SELECT * FROM messages
    WHERE from_user_id=$1 OR to_user_id=$1
    ORDER BY created_at ASC
  `, [userId]);
  return result.rows.map(mapMessage);
}

async function emitWorld() {
  const listings = await getPublicListings();
  io.emit('world:listings', listings);
  io.emit('world:players', getPublicPlayers());
}

async function firstFreeSlot(client, min, max) {
  const result = await client.query(`
    SELECT slot_id FROM listings
    WHERE status='active' AND slot_id BETWEEN $1 AND $2
  `, [min, max]);
  const used = new Set(result.rows.map(r => Number(r.slot_id)));
  const free = [];
  for (let i = min; i <= max; i += 1) if (!used.has(i)) free.push(i);
  return free.length ? free[0] : null;
}

io.on('connection', (socket) => {
  let user = null;

  socket.on('auth', async (payload) => {
    try {
      const tgUser = validateTelegramInitData(payload?.initData || '');
      if (tgUser) {
        user = { id: String(tgUser.id), name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '), username: tgUser.username || '' };
      } else if (DEMO_MODE) {
        user = { id: String(payload?.demoUser?.id || `demo-${socket.id}`), name: String(payload?.demoUser?.name || 'Demo Player').slice(0, 40), username: '' };
      } else {
        return socket.emit('auth:error', 'Не вдалося підтвердити Telegram-користувача');
      }

      const account = await ensureUser(user);
      onlineUsers.set(user.id, socket.id);
      onlinePlayers.set(user.id, { id: user.id, name: user.name, x: 1000, y: 1480, moving: false, faceLeft: false, socketId: socket.id });
      socket.join(`user:${user.id}`);

      const [listings, messages] = await Promise.all([getPublicListings(), getUserMessages(user.id)]);
      const bonusCheck = await pool.query(`SELECT last_daily_bonus, CURRENT_DATE AS today FROM users WHERE id=$1`, [user.id]);
      socket.emit('auth:ok', { user, listings, messages, players: getPublicPlayers(), crystals: account.crystals, dailyBonusAvailable: String(bonusCheck.rows[0]?.last_daily_bonus || '') !== String(bonusCheck.rows[0]?.today || '') });
      await emitWorld();
    } catch (error) {
      console.error('Auth error:', error);
      socket.emit('auth:error', 'Помилка сервера під час входу');
    }
  });

  socket.on('player:update', (p) => {
    if (!user) return;
    const pl = onlinePlayers.get(user.id);
    if (!pl) return;
    const x = Number(p?.x), y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    Object.assign(pl, { x: Math.max(0, Math.min(2000, x)), y: Math.max(0, Math.min(2000, y)), moving: !!p.moving, faceLeft: !!p.faceLeft });
    socket.broadcast.emit('player:updated', { id: pl.id, name: pl.name, x: pl.x, y: pl.y, moving: pl.moving, faceLeft: pl.faceLeft });
  });

  socket.on('listing:create', async (p) => {
    if (!user) return;
    const price = Number(p?.price), year = Number(p?.year);
    const brand = String(p?.brand || '').trim().slice(0, 30);
    const model = String(p?.model || '').trim().slice(0, 30);
    const description = String(p?.description || '').trim().slice(0, 700);
    const color = String(p?.color || 'black').toLowerCase().slice(0, 20);
    if (!brand || !model || !description || !Number.isFinite(price) || price <= 0 || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) {
      return socket.emit('listing:error', 'Перевірте всі поля оголошення');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const requestVip = p?.requestVip === true || p?.requestVip === 'true';
      let slotId;
      if (requestVip) {
        const account = await client.query(`SELECT crystals FROM users WHERE id=$1 FOR UPDATE`, [user.id]);
        const crystals = Number(account.rows[0]?.crystals || 0);
        if (crystals < VIP_PRICE) {
          await client.query('ROLLBACK');
          return socket.emit('vip:purchase-required', { price: VIP_PRICE, payload: p });
        }
        slotId = await randomFreeSlot(client, 1, VIP_SLOTS);
        if (slotId === null) {
          await client.query('ROLLBACK');
          return socket.emit('listing:error', 'Усі 5 VIP-місць зайняті');
        }
        const balance = await client.query(`UPDATE users SET crystals=crystals-$1, updated_at=NOW() WHERE id=$2 RETURNING crystals`, [VIP_PRICE, user.id]);
        socket.emit('balance:update', { crystals: Number(balance.rows[0].crystals) });
      } else {
        slotId = await firstFreeSlot(client, VIP_SLOTS + 1, TOTAL_SLOTS);
        if (slotId === null) {
          await client.query('ROLLBACK');
          return socket.emit('listing:error', 'Усі безкоштовні місця зайняті');
        }
      }

      const result = await client.query(`
        INSERT INTO listings
          (id, seller_id, seller_name, brand, model, year, price, description, color, slot_id, spot, zone, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,1,'active')
        RETURNING *
      `, [crypto.randomUUID(), user.id, user.name, brand, model, year, price, description, color, slotId]);

      await client.query('COMMIT');
      const listing = mapListing(result.rows[0]);
      socket.emit('listing:created', listing);
      await emitWorld();
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create listing error:', error);
      socket.emit('listing:error', error.code === '23505' ? 'Місце вже зайняте. Спробуйте ще раз' : 'Не вдалося виставити машину');
    } finally {
      client.release();
    }
  });

  socket.on('vip:buy-crystals', async () => {
    if (!user) return;
    try {
      if (!DEMO_MODE) return socket.emit('listing:error', 'Покупка кристалів через Telegram Payments ще не підключена');
      const result = await pool.query(`UPDATE users SET crystals=crystals+20, updated_at=NOW() WHERE id=$1 RETURNING crystals`, [user.id]);
      socket.emit('balance:update', { crystals: Number(result.rows[0].crystals) });
      socket.emit('listing:error', 'Демо: додано 20 кристалів');
    } catch (error) { console.error(error); }
  });


  socket.on('daily:claim', async () => {
    if (!user) return;
    try {
      const reward = 5;
      const result = await pool.query(`
        UPDATE users SET crystals=crystals+$1, last_daily_bonus=CURRENT_DATE, updated_at=NOW()
        WHERE id=$2 AND (last_daily_bonus IS NULL OR last_daily_bonus < CURRENT_DATE)
        RETURNING crystals
      `, [reward, user.id]);
      if (!result.rowCount) return socket.emit('daily:result', { ok:false, message:'Сьогодні бонус уже отримано' });
      socket.emit('daily:result', { ok:true, reward, crystals:Number(result.rows[0].crystals) });
    } catch (error) { console.error('Daily bonus error:', error); }
  });

  socket.on('seller:rate', async (p) => {
    if (!user) return;
    const sellerId=String(p?.sellerId||'');
    const rating=Number(p?.rating);
    if (!sellerId || sellerId===user.id || !Number.isInteger(rating) || rating<1 || rating>5) return;
    try {
      await pool.query(`INSERT INTO seller_ratings (seller_id,rater_id,rating) VALUES ($1,$2,$3)
        ON CONFLICT (seller_id,rater_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=NOW()`, [sellerId,user.id,rating]);
      const r=await pool.query(`SELECT COALESCE(AVG(rating),0) avg, COUNT(*)::int count FROM seller_ratings WHERE seller_id=$1`,[sellerId]);
      io.emit('seller:rating-updated',{sellerId,rating:Number(r.rows[0].avg),ratingCount:Number(r.rows[0].count)});
    } catch(error){console.error('Rating error:',error)}
  });

  socket.on('listing:remove', async (id) => {
    if (!user) return;
    const result = await pool.query(`UPDATE listings SET status='removed' WHERE id=$1 AND seller_id=$2 AND status='active' RETURNING id`, [String(id), user.id]);
    if (result.rowCount) await emitWorld();
  });

  socket.on('chat:send', async (p) => {
    if (!user) return;
    const text = String(p?.text || '').trim().slice(0, 700);
    const toUserId = String(p?.toUserId || '');
    if (!text || !toUserId || toUserId === user.id) return;
    const listingResult = await pool.query(`SELECT * FROM listings WHERE id=$1 LIMIT 1`, [String(p?.listingId || '')]);
    if (!listingResult.rowCount) return;
    const listing = mapListing(listingResult.rows[0]);
    const participant = String(listing.sellerId) === user.id ? toUserId : String(listing.sellerId);
    if (participant !== toUserId) return;
    if (String(listing.sellerId) === user.id) {
      const known = await pool.query(`SELECT id FROM messages WHERE listing_id=$1 AND ((from_user_id=$2 AND to_user_id=$3) OR (from_user_id=$3 AND to_user_id=$2)) LIMIT 1`, [listing.id, user.id, toUserId]);
      if (!known.rowCount) return;
    }
    const result = await pool.query(`
      INSERT INTO messages (id, listing_id, listing_title, from_user_id, from_name, to_user_id, text, is_read)
      VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING *
    `, [crypto.randomUUID(), listing.id, `${listing.brand} ${listing.model}`, user.id, user.name, toUserId, text]);
    const message = mapMessage(result.rows[0]);
    io.to(`user:${toUserId}`).emit('chat:new', message);
    socket.emit('chat:sent', message);
  });

  socket.on('chat:read', async (p) => {
    if (!user) return;
    await pool.query(`UPDATE messages SET is_read=TRUE WHERE to_user_id=$1 AND from_user_id=$2 AND listing_id=$3 AND is_read=FALSE`, [user.id, String(p?.partnerId || ''), String(p?.listingId || '')]);
  });

  socket.on('disconnect', async () => {
    if (user && onlineUsers.get(user.id) === socket.id) {
      onlineUsers.delete(user.id);
      onlinePlayers.delete(user.id);
      socket.broadcast.emit('player:left', { id: user.id });
      try { await emitWorld(); } catch (error) { console.error(error); }
    }
  });
});

app.get('/health', async (_q, r) => {
  try {
    await pool.query('SELECT 1');
    r.json({ ok: true, database: true, map: '2600x2600', slots: TOTAL_SLOTS });
  } catch {
    r.status(500).json({ ok: false, database: false });
  }
});
app.get('/{*splat}', (_q, r) => r.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  try {
    await initDatabase();
    server.listen(PORT, () => console.log(`AutoBazar v6.1 PostgreSQL: http://localhost:${PORT}`));
  } catch (error) {
    console.error('Не вдалося запустити сервер:', error);
    process.exit(1);
  }
}
start();
