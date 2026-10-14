import { DurableObject } from 'cloudflare:workers';
import { generateVapidKeys, sendPush } from './push.js';

const TTL_MS = 24 * 3600 * 1000;      // items vanish after a day
const CHUNK = 1024 * 1024;            // SQLite rows max out at 2 MB
const MAX_SIZE = 50 * 1024 * 1024;
const MAX_TEXT = 100 * 1024;
const PAIR_MS = 10 * 60 * 1000;
const INVITE_MS = 14 * 24 * 3600 * 1000;
const INVITE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
const DEVICES = ['phone', 'laptop'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    return env.HUB.get(env.HUB.idFromName('main')).fetch(req);
  },
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const hex = (bytes) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const newId = () => hex(crypto.getRandomValues(new Uint8Array(9)));
const sha256 = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const inviteCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => INVITE_ABC[b % 32]).join('');
const cleanInvite = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// One instance holds everything: users, items, file chunks, push subscriptions, laptop sockets.
// Every user sees every other user as a friend.
export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, dir TEXT NOT NULL, kind TEXT NOT NULL, name TEXT, mime TEXT,
        size INTEGER NOT NULL DEFAULT 0, text TEXT, created INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chunks (id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, idx));
      CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, by_user TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pairs (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    `);
    this.addColumns('items', ['from_user', 'to_user', 'from_dev', 'to_dev']);
    this.addColumns('subs', ['user_id']);
    // Laptop keepalives are answered without waking the object up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(() => this.adoptOwner());
  }

  addColumns(table, cols) {
    const have = new Set(this.sql.exec(`PRAGMA table_info(${table})`).toArray().map(c => c.name));
    for (const c of cols) if (!have.has(c)) this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${c} TEXT`);
  }

  // Beam started single-user with one shared TOKEN. That key becomes the first account, so
  // devices paired before friends existed keep working and everything they had is theirs.
  async adoptOwner() {
    if (!this.env.TOKEN) return;
    const hash = await sha256(this.env.TOKEN);
    if (this.sql.exec('SELECT 1 FROM tokens WHERE hash = ?', hash).toArray().length) return;
    const id = newId();
    this.sql.exec('INSERT INTO users (id, name, created) VALUES (?, ?, ?)', id, cleanName(this.env.OWNER_NAME) || 'Me', Date.now());
    this.sql.exec('INSERT INTO tokens (hash, user_id, created) VALUES (?, ?, ?)', hash, id, Date.now());
    this.sql.exec(`UPDATE items SET from_user = ?, to_user = ?, to_dev = substr(dir, 4),
      from_dev = CASE dir WHEN 'to_phone' THEN 'laptop' ELSE 'phone' END WHERE to_user IS NULL`, id, id);
    this.sql.exec('UPDATE subs SET user_id = ? WHERE user_id IS NULL', id);
  }

  kvGet(k) { return this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0]?.v; }
  kvSet(k, v) { this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, v); }

  async vapid() {
    const stored = this.kvGet('vapid');
    if (stored) return JSON.parse(stored);
    const keys = await generateVapidKeys();
    this.kvSet('vapid', JSON.stringify(keys));
    return keys;
  }

  async userFor(token) {
    if (!token) return null;
    return this.sql.exec('SELECT u.id, u.name FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ?', await sha256(token)).toArray()[0] || null;
  }

  async issueToken(userId) {
    const token = hex(crypto.getRandomValues(new Uint8Array(24)));
    this.sql.exec('INSERT INTO tokens (hash, user_id, created) VALUES (?, ?, ?)', await sha256(token), userId, Date.now());
    return token;
  }

  // Codes are guessable one at a time, so wrong guesses from anyone count against one shared budget.
  tooManyFails() {
    const f = JSON.parse(this.kvGet('fails') || '{"n":0,"since":0}');
    return Date.now() - f.since < 10 * 60 * 1000 && f.n >= 30;
  }
  fail(msg) {
    let f = JSON.parse(this.kvGet('fails') || '{"n":0,"since":0}');
    if (Date.now() - f.since >= 10 * 60 * 1000) f = { n: 0, since: Date.now() };
    f.n++;
    this.kvSet('fails', JSON.stringify(f));
    return json({ error: msg }, 400);
  }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const m = req.method;

    // Unauthenticated: the VAPID public key, invites and pairing codes.
    if (path === '/api/vapid') return json({ publicKey: (await this.vapid()).publicKey });
    if (path === '/api/pair/claim' && m === 'POST') return this.claimPair(req);
    if (path === '/api/join' && m === 'POST') return this.join(req);
    const invMatch = path.match(/^\/api\/invites\/([A-Za-z0-9-]+)$/);
    if (invMatch && m === 'GET') {
      if (this.tooManyFails()) return json({ error: 'Too many tries. Wait a few minutes.' }, 429);
      const inv = this.sql.exec('SELECT u.name FROM invites i JOIN users u ON u.id = i.by_user WHERE i.code = ? AND i.expires > ?',
        cleanInvite(invMatch[1]), Date.now()).toArray()[0];
      return inv ? json({ from: inv.name }) : this.fail('This invite has expired or was already used. Ask for a new one.');
    }

    const me = await this.userFor((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t'));
    if (!me) return json({ error: 'unauthorized' }, 401);

    if (path === '/api/ws') {
      if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['laptop', `laptop:${me.id}`]);
      this.presenceChanged(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/api/me') {
      if (m === 'POST') {
        const name = cleanName((await req.json().catch(() => ({}))).name);
        if (!name) return json({ error: 'Type a name' }, 400);
        this.sql.exec('UPDATE users SET name = ? WHERE id = ?', name, me.id);
        me.name = name;
        this.presenceChanged();
      }
      return json(me);
    }
    if (path === '/api/friends' && m === 'GET') return json(this.friends(me));
    if (path === '/api/invites' && m === 'POST') {
      const code = inviteCode();
      this.sql.exec('INSERT INTO invites (code, by_user, expires) VALUES (?, ?, ?)', code, me.id, Date.now() + INVITE_MS);
      await this.armCleanup();
      return json({ code, url: `${url.origin}/join?c=${code}`, expires: Date.now() + INVITE_MS });
    }
    if (path === '/api/pair/start' && m === 'POST') {
      let code;
      do code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      while (this.sql.exec('SELECT 1 FROM pairs WHERE code = ?', code).toArray().length);
      this.sql.exec('DELETE FROM pairs WHERE user_id = ?', me.id);
      this.sql.exec('INSERT INTO pairs (code, user_id, expires) VALUES (?, ?, ?)', code, me.id, Date.now() + PAIR_MS);
      await this.armCleanup();
      return json({ code, expires: Date.now() + PAIR_MS });
    }
    if (path === '/api/subscribe' && m === 'POST') {
      const { subscription } = await req.json();
      if (!subscription?.endpoint || !subscription?.keys?.p256dh) return json({ error: 'bad subscription' }, 400);
      this.sql.exec('INSERT OR REPLACE INTO subs (endpoint, json, user_id) VALUES (?, ?, ?)', subscription.endpoint, JSON.stringify(subscription), me.id);
      return json({ ok: true });
    }
    if (path === '/api/test-push' && m === 'POST') {
      const sent = await this.pushTo(me.id, { title: 'Beam', body: 'Notifications work 🎉' }, url.origin);
      return json({ sent });
    }
    if (path === '/api/status' && m === 'GET') {
      return json({
        me,
        subs: this.subCount(me.id),
        devices: this.sql.exec('SELECT COUNT(*) AS n FROM tokens WHERE user_id = ?', me.id).one().n,
        laptopOnline: this.laptopOnline(me.id),
        friends: this.friends(me),
      });
    }
    if (path === '/api/send' && m === 'POST') return this.receive(req, url, me);
    if (path === '/api/items' && m === 'GET') {
      // The phone's feed: what reached this user's phone, and what their phone sent.
      return json(this.sql.exec(`
        SELECT i.id, i.kind, i.name, i.mime, i.size, i.text, i.created, i.delivered, i.from_user, i.to_user, i.from_dev, i.to_dev,
          f.name AS from_name, t.name AS to_name
        FROM items i LEFT JOIN users f ON f.id = i.from_user LEFT JOIN users t ON t.id = i.to_user
        WHERE (i.to_user = ? AND i.to_dev = 'phone') OR (i.from_user = ? AND i.from_dev = 'phone')
        ORDER BY i.created DESC LIMIT 60`, me.id, me.id).toArray()
        .map(i => ({ ...i, incoming: i.to_user === me.id && i.to_dev === 'phone', dir: i.to_user === me.id && i.to_dev === 'phone' ? 'to_phone' : 'to_laptop' })));
    }
    if (path === '/api/pending' && m === 'GET') {
      return json(this.sql.exec(`
        SELECT i.id, i.kind, i.name, i.mime, i.size, i.text, i.created, i.from_user, i.from_dev, f.name AS from_name
        FROM items i LEFT JOIN users f ON f.id = i.from_user
        WHERE i.to_user = ? AND i.to_dev = 'laptop' AND i.delivered = 0 ORDER BY i.created`, me.id).toArray());
    }

    const itemMatch = path.match(/^\/api\/items\/([0-9a-f]+)(\/ack)?$/);
    if (itemMatch) {
      const [, id, ack] = itemMatch;
      const item = this.sql.exec('SELECT * FROM items WHERE id = ? AND (to_user = ? OR from_user = ?)', id, me.id, me.id).toArray()[0];
      if (!item) return json({ error: 'not found' }, 404);
      if (ack && m === 'POST') {
        if (item.to_user === me.id) this.sql.exec('UPDATE items SET delivered = 1 WHERE id = ?', id);
        return json({ ok: true });
      }
      if (m === 'DELETE') {
        this.sql.exec('DELETE FROM chunks WHERE id = ?', id);
        this.sql.exec('DELETE FROM items WHERE id = ?', id);
        return json({ ok: true });
      }
      if (m === 'GET') {
        if (item.kind === 'text') return new Response(item.text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
        const body = new Uint8Array(item.size);
        let o = 0;
        for (const row of this.sql.exec('SELECT data FROM chunks WHERE id = ? ORDER BY idx', id)) {
          const part = new Uint8Array(row.data);
          body.set(part, o);
          o += part.length;
        }
        return new Response(body, {
          headers: {
            'content-type': item.mime || 'application/octet-stream',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.name || 'file')}`,
          },
        });
      }
    }
    return json({ error: 'not found' }, 404);
  }

  subCount(userId) { return this.sql.exec('SELECT COUNT(*) AS n FROM subs WHERE user_id = ?', userId).one().n; }
  laptopOnline(userId) { return this.ctx.getWebSockets(`laptop:${userId}`).length > 0; }

  friends(me) {
    return this.sql.exec('SELECT id, name FROM users WHERE id != ? ORDER BY created', me.id).toArray()
      .map(u => ({ ...u, phone: this.subCount(u.id) > 0, laptop: this.laptopOnline(u.id) }));
  }

  // Lets open laptops refresh their friends list when someone comes online, goes away or renames.
  presenceChanged(except) {
    for (const ws of this.ctx.getWebSockets('laptop')) {
      if (ws !== except) try { ws.send(JSON.stringify({ type: 'presence' })); } catch {}
    }
  }

  async claimPair(req) {
    if (this.tooManyFails()) return json({ error: 'Too many tries. Wait a few minutes.' }, 429);
    const { code } = await req.json().catch(() => ({}));
    const pair = this.sql.exec('SELECT p.user_id, u.name FROM pairs p JOIN users u ON u.id = p.user_id WHERE p.code = ? AND p.expires > ?',
      String(code || '').replace(/\D/g, ''), Date.now()).toArray()[0];
    if (!pair) return this.fail('Wrong or expired code. Make a new one on the laptop.');
    this.sql.exec('DELETE FROM pairs WHERE code = ?', String(code).replace(/\D/g, ''));
    return json({ token: await this.issueToken(pair.user_id), user: { id: pair.user_id, name: pair.name } });
  }

  // Redeems an invite into a new account. The server's own TOKEN works too: it signs in as the owner,
  // which is how a fresh install of whoever runs the server gets set up.
  async join(req) {
    if (this.tooManyFails()) return json({ error: 'Too many tries. Wait a few minutes.' }, 429);
    const body = await req.json().catch(() => ({}));
    const raw = String(body.code || '').trim();
    if (this.env.TOKEN && sameSecret(raw, this.env.TOKEN)) {
      return json({ token: this.env.TOKEN, user: await this.userFor(this.env.TOKEN) });
    }
    const code = cleanInvite(raw);
    const inv = this.sql.exec('SELECT by_user FROM invites WHERE code = ? AND expires > ?', code, Date.now()).toArray()[0];
    if (!inv) return this.fail('This invite has expired or was already used. Ask for a new one.');
    const name = cleanName(body.name);
    if (!name) return json({ error: 'Type your name' }, 400);
    this.sql.exec('DELETE FROM invites WHERE code = ?', code);
    const id = newId();
    this.sql.exec('INSERT INTO users (id, name, created) VALUES (?, ?, ?)', id, name, Date.now());
    this.presenceChanged();
    return json({ token: await this.issueToken(id), user: { id, name } });
  }

  // Accepts raw bytes (X-Name / X-Kind headers), multipart forms (iOS Shortcuts, web app) or JSON {text}.
  // ?to=phone|laptop picks the device, ?user= a friend (default: yourself), ?from= the sending device.
  async receive(req, url, me) {
    const to = url.searchParams.get('to') === 'laptop' ? 'laptop' : 'phone';
    const toUser = url.searchParams.get('user') || me.id;
    const target = toUser === me.id ? me : this.sql.exec('SELECT id, name FROM users WHERE id = ?', toUser).toArray()[0];
    if (!target) return json({ error: 'That person isn\'t on Beam anymore' }, 404);
    const fromParam = url.searchParams.get('from');
    const from = DEVICES.includes(fromParam) ? fromParam : to === 'phone' ? 'laptop' : 'phone';
    if (target.id === me.id && from === to) return json({ error: 'That\'s this device' }, 400);

    const ct = req.headers.get('content-type') || '';
    const entries = [];
    if (ct.startsWith('multipart/form-data') || ct.startsWith('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      for (const [, v] of form.entries()) {
        if (typeof v === 'string') { if (v.trim()) entries.push({ kind: 'text', text: v }); }
        else entries.push({ kind: 'file', name: v.name || 'file', mime: v.type, data: new Uint8Array(await v.arrayBuffer()) });
      }
    } else if (ct.startsWith('application/json')) {
      const body = await req.json();
      if (body.text) entries.push({ kind: 'text', text: String(body.text) });
    } else {
      const data = new Uint8Array(await req.arrayBuffer());
      if ((req.headers.get('x-kind') || 'file') === 'text') entries.push({ kind: 'text', text: new TextDecoder().decode(data) });
      else entries.push({ kind: 'file', name: decodeURIComponent(req.headers.get('x-name') || 'file'), mime: ct, data });
    }
    if (!entries.length) return json({ error: 'nothing to send' }, 400);

    const items = [];
    for (const e of entries) {
      if (e.kind === 'file' && e.data.length > MAX_SIZE) return json({ error: 'File too big (50 MB max)' }, 413);
      if (e.kind === 'text' && e.text.length > MAX_TEXT) return json({ error: 'Text too long' }, 413);
      const item = {
        id: newId(), dir: `to_${to}`, kind: e.kind, name: e.kind === 'file' ? e.name : null,
        mime: e.kind === 'file' ? (e.mime || 'application/octet-stream') : 'text/plain',
        size: e.kind === 'file' ? e.data.length : e.text.length, text: e.kind === 'text' ? e.text : null, created: Date.now(),
      };
      this.sql.exec(`INSERT INTO items (id, dir, kind, name, mime, size, text, created, from_user, to_user, from_dev, to_dev)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id, item.dir, item.kind, item.name, item.mime, item.size, item.text, item.created, me.id, target.id, from, to);
      if (e.kind === 'file') {
        for (let i = 0, idx = 0; i < e.data.length || idx === 0; i += CHUNK, idx++) {
          this.sql.exec('INSERT INTO chunks (id, idx, data) VALUES (?, ?, ?)', item.id, idx, e.data.slice(i, i + CHUNK));
        }
      }
      items.push(item);
    }

    await this.armCleanup();
    // Tell the sender whether anyone will actually notice, so it can warn instead of failing silently.
    if (to === 'phone') {
      const n = items.length;
      const first = items[0];
      const body = n > 1 ? `${n} items` : first.kind === 'text' ? first.text.slice(0, 180) : first.name;
      const title = target.id === me.id ? 'From your laptop' : `From ${me.name}`;
      const pushed = await this.pushTo(target.id, { title, body, id: first.id }, url.origin);
      return json({ ok: true, ids: items.map(i => i.id), pushed });
    }
    const sockets = this.ctx.getWebSockets(`laptop:${target.id}`);
    for (const ws of sockets) {
      try { ws.send(JSON.stringify({ type: 'item' })); } catch {}
    }
    return json({ ok: true, ids: items.map(i => i.id), laptopOnline: sockets.length > 0 });
  }

  async pushTo(userId, payload, origin) {
    const vapid = await this.vapid();
    let sent = 0;
    for (const { endpoint, json: raw } of this.sql.exec('SELECT endpoint, json FROM subs WHERE user_id = ?', userId).toArray()) {
      try {
        const res = await sendPush(JSON.parse(raw), payload, vapid, origin);
        if (res.status === 404 || res.status === 410) this.sql.exec('DELETE FROM subs WHERE endpoint = ?', endpoint);
        else if (res.ok) sent++;
        else console.log('push failed', res.status, await res.text());
      } catch (err) {
        console.log('push error', String(err));
      }
    }
    return sent;
  }

  async armCleanup() {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 3600 * 1000);
  }

  async alarm() {
    const now = Date.now();
    const cutoff = now - TTL_MS;
    this.sql.exec('DELETE FROM chunks WHERE id IN (SELECT id FROM items WHERE created < ?)', cutoff);
    this.sql.exec('DELETE FROM items WHERE created < ?', cutoff);
    this.sql.exec('DELETE FROM pairs WHERE expires < ?', now);
    this.sql.exec('DELETE FROM invites WHERE expires < ?', now);
    const left = this.sql.exec('SELECT (SELECT COUNT(*) FROM items) + (SELECT COUNT(*) FROM invites) AS n').one().n;
    if (left) await this.ctx.storage.setAlarm(now + 3600 * 1000);
  }

  webSocketMessage() {}
  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch {}
    this.presenceChanged(ws);
  }
}
