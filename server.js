// ── THE.POUCHES — SERVER ──────────────────────────────────────────────────────
'use strict';

const express    = require('express');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');
const webpush    = require('web-push');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET      = process.env.JWT_SECRET      || 'change-me-in-production';
const ADMIN_PASS      = process.env.ADMIN_PASSWORD  || 'admin123';
const VAPID_MAILTO    = process.env.VAPID_MAILTO    || 'mailto:admin@example.com';
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function query(sql, params) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      price       NUMERIC(10,2) NOT NULL DEFAULT 0,
      cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
      img         TEXT    NOT NULL DEFAULT '',
      badge       TEXT,
      category    TEXT    NOT NULL DEFAULT '',
      qty         INTEGER NOT NULL DEFAULT 0,
      max_qty     INTEGER,
      filters     JSONB   NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Migration: rename old "desc" column to description if it exists
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='products' AND column_name='desc'
      ) THEN
        ALTER TABLE products RENAME COLUMN "desc" TO description;
      END IF;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id           BIGSERIAL PRIMARY KEY,
      items        JSONB   NOT NULL DEFAULT '[]',
      vehicle      TEXT    NOT NULL DEFAULT '',
      plate        TEXT    NOT NULL DEFAULT '',
      date_str     TEXT    NOT NULL DEFAULT '',
      total        NUMERIC(10,2) NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'new',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT 'null'
    );
  `);

  await query(`
    INSERT INTO config (key, value) VALUES
      ('hero',               '{"bg":"","bgSize":100,"bgPosX":0,"bgPosY":0,"bgRotation":0,"bgFill":"","bgPosVer":2}'::jsonb),
      ('schedule',           '{"weekly":{"0":{"open":false,"start":"09:00","end":"17:00"},"1":{"open":true,"start":"09:00","end":"17:00"},"2":{"open":true,"start":"09:00","end":"17:00"},"3":{"open":true,"start":"09:00","end":"17:00"},"4":{"open":true,"start":"09:00","end":"17:00"},"5":{"open":true,"start":"09:00","end":"17:00"},"6":{"open":false,"start":"09:00","end":"17:00"}},"overrides":{},"slotMins":30}'::jsonb),
      ('pickupInstructions', '{"title":"Pickup Instructions","text":"","img":""}'::jsonb),
      ('filters',            '[]'::jsonb),
      ('slides',             '[]'::jsonb),
      ('heroBanners',         '[]'::jsonb),
      ('siteSettings',       '{"name":"The.Pouches","logoUrl":"","footerText":"All items sold as-is · Questions? Just reach out.","accentColor":"#c8522a"}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    INSERT INTO config (key, value) VALUES ('vapid_keys', 'null'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  `);

  await initVapid();
  console.log('✅  Database ready');
}

async function initVapid() {
  let pub = VAPID_PUBLIC_KEY;
  let priv = VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const r = await query(`SELECT value FROM config WHERE key='vapid_keys'`);
    const stored = r.rows[0]?.value;
    if (stored && stored.publicKey) {
      pub = stored.publicKey;
      priv = stored.privateKey;
    } else {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey;
      priv = keys.privateKey;
      await query(`UPDATE config SET value=$1 WHERE key='vapid_keys'`, [JSON.stringify({ publicKey: pub, privateKey: priv })]);
      console.log('✅  Generated VAPID keys');
    }
  }
  webpush.setVapidDetails(VAPID_MAILTO, pub, priv);
  global._vapidPublicKey = pub;
}

app.use(express.json({ limit: '10mb' }));

app.get('/manifest.json', async (req, res) => {
  try {
    const r = await query(`SELECT value FROM config WHERE key='siteSettings'`);
    const s = r.rows[0]?.value || {};
    res.json({
      name: (s.name || 'Admin') + ' Admin',
      short_name: s.name || 'Admin',
      start_url: '/admin.html',
      display: 'standalone',
      background_color: '#1a1612',
      theme_color: s.accentColor || '#1a1612',
      icons: []
    });
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});

app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});
app.use(express.static(path.join(__dirname)));

// ── AUTH ──────────────────────────────────────────────────────────────────────
const revokedTokens = new Set();

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  if (revokedTokens.has(token)) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function requireAdmin(req, res, next) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.adminToken = token;
  next();
}

// ── SSE ───────────────────────────────────────────────────────────────────────
const sseClients = new Set();
const sseTickets = new Map();

function broadcastSSE(event, data, adminOnly = false) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (adminOnly && !client.isAdmin) continue;
    try { client.res.write(payload); } catch {}
  }
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (password !== ADMIN_PASS) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: signToken({ role: 'admin' }) });
});

app.post('/api/logout', requireAdmin, (req, res) => {
  revokedTokens.add(req.adminToken);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  res.json({ valid: !!(token && verifyToken(token)) });
});

// ── SSE ROUTES ────────────────────────────────────────────────────────────────
app.post('/api/sse-ticket', requireAdmin, (req, res) => {
  const ticket = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sseTickets.set(ticket, { isAdmin: true, expires: Date.now() + 30_000 });
  res.json({ ticket });
});

app.get('/api/events', (req, res) => {
  let isAdmin = false;
  const ticket = req.query.ticket;
  if (ticket && sseTickets.has(ticket)) {
    const t = sseTickets.get(ticket);
    if (Date.now() < t.expires) { isAdmin = t.isAdmin; sseTickets.delete(ticket); }
  } else {
    const auth  = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token && verifyToken(token)) isAdmin = true;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client = { res, isAdmin };
  sseClients.add(client);

  query('SELECT * FROM products ORDER BY id')
    .then(r => res.write(`event: products\ndata: ${JSON.stringify(r.rows.map(dbToProduct))}\n\n`))
    .catch(() => {});

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
  }, 25_000);

  req.on('close', () => { clearInterval(keepAlive); sseClients.delete(client); });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
function dbToProduct(row) {
  return {
    id:        row.id,
    name:      row.name,
    desc:      row.description,
    price:     parseFloat(row.price),
    cost:      parseFloat(row.cost),
    img:       row.img,
    badge:     row.badge,
    category:  row.category,
    qty:       row.qty,
    maxQty:    row.max_qty,
    filters:   row.filters || {},
    createdAt: row.created_at,
  };
}

app.get('/api/products', async (req, res) => {
  try {
    const r = await query('SELECT * FROM products ORDER BY id');
    res.json(r.rows.map(dbToProduct));
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, desc, price, cost, img, badge, category, qty, maxQty, filters } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name and price required' });
  try {
    const r = await query(
      `INSERT INTO products (name, description, price, cost, img, badge, category, qty, max_qty, filters)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, desc||'', price, cost||0, img||'', badge||null, category||'', qty??0, maxQty||null, JSON.stringify(filters||{})]
    );
    const all = (await query('SELECT * FROM products ORDER BY id')).rows.map(dbToProduct);
    broadcastSSE('products', all);
    res.status(201).json(dbToProduct(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, desc, price, cost, img, badge, category, qty, maxQty, filters } = req.body;
  try {
    const r = await query(
      `UPDATE products SET
        name=$1, description=$2, price=$3, cost=$4, img=$5, badge=$6,
        category=$7, qty=$8, max_qty=$9, filters=$10
       WHERE id=$11 RETURNING *`,
      [name, desc||'', price, cost||0, img||'', badge||null, category||'', qty??0, maxQty||null, JSON.stringify(filters||{}), id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const all = (await query('SELECT * FROM products ORDER BY id')).rows.map(dbToProduct);
    broadcastSSE('products', all);
    res.json(dbToProduct(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await query('DELETE FROM products WHERE id=$1', [id]);
    const all = (await query('SELECT * FROM products ORDER BY id')).rows.map(dbToProduct);
    broadcastSSE('products', all);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

// ── CONFIG ────────────────────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  try {
    const r = await query('SELECT key, value FROM config');
    const cfg = {};
    r.rows.forEach(row => { cfg[row.key] = row.value; });
    res.json(cfg);
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/config', requireAdmin, async (req, res) => {
  const { hero, heroBanners, schedule, pickupInstructions, filters, slides, siteSettings } = req.body;
  const updates = { hero, heroBanners, schedule, pickupInstructions, filters, slides, siteSettings };
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await query(
        `INSERT INTO config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)]
      );
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/upload', requireAdmin, (req, res) => {
  res.status(400).json({ error: 'File uploads are disabled. Please use an image URL instead.' });
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
app.get('/api/push-vapid-key', (req, res) => {
  res.json({ publicKey: global._vapidPublicKey || null });
});

app.post('/api/push-subscribe', requireAdmin, async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth)
    return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=$2, auth=$3`,
      [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/api/push-subscribe', requireAdmin, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  try {
    await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [endpoint]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
function dbToOrder(row) {
  return {
    id:          row.id.toString(),
    items:       row.items,
    vehicle:     row.vehicle,
    plate:       row.plate,
    dateStr:     row.date_str,
    total:       parseFloat(row.total).toFixed(2),
    status:      row.status,
    createdAt:   row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

app.post('/api/order', async (req, res) => {
  const { items, vehicle, plate, dateStr } = req.body || {};
  if (!items?.length || !vehicle || !plate || !dateStr)
    return res.status(400).json({ error: 'Missing required fields' });

  const errors = [];
  for (const item of items) {
    const r = await query('SELECT qty FROM products WHERE id=$1', [item.id]).catch(() => null);
    if (!r?.rows.length) { errors.push(`${item.name} is no longer available`); continue; }
    const stock = r.rows[0].qty;
    if (stock !== null && stock < item.qty) errors.push(`${item.name}: only ${stock} in stock`);
  }
  if (errors.length) return res.status(409).json({ error: 'Stock issue', details: errors });

  for (const item of items)
    await query('UPDATE products SET qty = qty - $1 WHERE id=$2 AND qty >= $1', [item.qty, item.id]);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);

  try {
    const r = await query(
      `INSERT INTO orders (items, vehicle, plate, date_str, total, status)
       VALUES ($1,$2,$3,$4,$5,'new') RETURNING *`,
      [JSON.stringify(items), vehicle, plate, dateStr, total]
    );
    const order       = dbToOrder(r.rows[0]);
    const allProducts = (await query('SELECT * FROM products ORDER BY id')).rows.map(dbToProduct);
    const allOrders   = (await query('SELECT * FROM orders ORDER BY id DESC')).rows.map(dbToOrder);
    broadcastSSE('products', allProducts);
    broadcastSSE('new_order', order, true);
    broadcastSSE('orders', allOrders, true);
    // Web Push to all subscribed devices
    try {
      const subs = await query(`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
      const payload = JSON.stringify({
        title: `New Order — $${order.total}`,
        body: order.items.map(i => `${i.name} ×${i.qty}`).join(', ') + ` · ${order.vehicle} · ${order.plate.toUpperCase()}`,
        orderId: order.id,
      });
      await Promise.allSettled(subs.rows.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(async err => {
          if (err.statusCode === 410 || err.statusCode === 404)
            await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [sub.endpoint]);
        })
      ));
    } catch (pushErr) { console.error('Push error:', pushErr); }
    res.status(201).json(order);
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const r = await query('SELECT * FROM orders ORDER BY id DESC');
    res.json(r.rows.map(dbToOrder));
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  const valid = ['new', 'ready', 'picked-up', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const r = await query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const allOrders = (await query('SELECT * FROM orders ORDER BY id DESC')).rows.map(dbToOrder);
    broadcastSSE('orders', allOrders, true);
    res.json(dbToOrder(r.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.post('/api/orders/:id/revert', requireAdmin, async (req, res) => {
  try {
    const r = await query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const order = r.rows[0];
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });
    for (const item of order.items)
      await query('UPDATE products SET qty = qty + $1 WHERE id=$2', [item.qty, item.id]);
    await query('UPDATE orders SET status=$1, cancelled_at=NOW() WHERE id=$2', ['cancelled', req.params.id]);
    const allProducts = (await query('SELECT * FROM products ORDER BY id')).rows.map(dbToProduct);
    const allOrders   = (await query('SELECT * FROM orders ORDER BY id DESC')).rows.map(dbToOrder);
    broadcastSSE('products', allProducts);
    broadcastSSE('orders', allOrders, true);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/api/orders', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM orders');
    broadcastSSE('orders', [], true);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'DB error' }); }
});

// ── CATCH-ALL ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`🚀  The.Pouches running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err); process.exit(1); });
