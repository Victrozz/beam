// End-to-end check of accounts, invites, pairing and sending between friends.
// Run against `npx wrangler dev` (uses TOKEN from .dev.vars): node test/friends.test.mjs [http://127.0.0.1:8787]
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const OWNER = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^TOKEN=(.*)$/m)[1].trim();

let failed = 0;
function check(what, ok, extra = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ' ' + extra}`);
  if (!ok) failed++;
}
async function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && typeof body === 'object' ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body && typeof body === 'object' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

const me = await call('/api/status', { token: OWNER });
check('owner token still works', me.status === 200, JSON.stringify(me.data));
const owner = me.data.me;

check('unknown token rejected', (await call('/api/status', { token: 'nope' })).status === 401);

const inv = await call('/api/invites', { token: OWNER, method: 'POST' });
check('invite created', inv.status === 200 && /^[A-Z2-9]{8}$/.test(inv.data.code), JSON.stringify(inv.data));
check('invite url points at /join', inv.data.url.endsWith(`/join?c=${inv.data.code}`));

const look = await call(`/api/invites/${inv.data.code.slice(0, 4)}-${inv.data.code.slice(4).toLowerCase()}`);
check('invite lookup names the inviter (dashes / case ignored)', look.status === 200 && look.data.from === owner.name, JSON.stringify(look.data));

check('join without a name refused', (await call('/api/join', { method: 'POST', body: { code: inv.data.code } })).status === 400);
const joined = await call('/api/join', { method: 'POST', body: { code: inv.data.code, name: '  Diego  ' } });
check('join creates an account', joined.status === 200 && joined.data.user.name === 'Diego' && joined.data.token, JSON.stringify(joined.data));
const DIEGO = joined.data.token;
const diego = joined.data.user;
check('invite is single use', (await call('/api/join', { method: 'POST', body: { code: inv.data.code, name: 'Eve' } })).status === 400);

const ownerLogin = await call('/api/join', { method: 'POST', body: { code: OWNER } });
check('server key signs in as the owner', ownerLogin.status === 200 && ownerLogin.data.user.id === owner.id, JSON.stringify(ownerLogin.data));

const fr = await call('/api/friends', { token: OWNER });
check('owner sees Diego as a friend', fr.data.some((f) => f.id === diego.id && f.name === 'Diego'), JSON.stringify(fr.data));
const fr2 = await call('/api/friends', { token: DIEGO });
check('Diego sees the owner', fr2.data.some((f) => f.id === owner.id), JSON.stringify(fr2.data));

// Owner's laptop -> Diego's laptop
const s1 = await call(`/api/send?to=laptop&user=${diego.id}&from=laptop`, { token: OWNER, method: 'POST', body: 'hola diego', headers: { 'x-kind': 'text', 'content-type': 'text/plain' } });
check('send text to a friend\'s laptop', s1.status === 200 && s1.data.ok, JSON.stringify(s1.data));
const pend = await call('/api/pending', { token: DIEGO });
const got = pend.data.find((i) => i.id === s1.data.ids[0]);
check('it is pending on Diego\'s laptop, from the owner', got && got.text === 'hola diego' && got.from_name === owner.name && got.from_dev === 'laptop', JSON.stringify(pend.data));
check('owner\'s own pending does not include it', !(await call('/api/pending', { token: OWNER })).data.some((i) => i.id === s1.data.ids[0]));

// Diego's laptop -> owner's phone (file)
const s2 = await call(`/api/send?to=phone&user=${owner.id}&from=laptop`, { token: DIEGO, method: 'POST', body: 'PNGDATA', headers: { 'x-kind': 'file', 'x-name': encodeURIComponent('foto ñ.png'), 'content-type': 'image/png' } });
check('send file to a friend\'s phone', s2.status === 200 && 'pushed' in s2.data, JSON.stringify(s2.data));
const feed = await call('/api/items', { token: OWNER });
const f2 = feed.data.find((i) => i.id === s2.data.ids[0]);
check('it is in the owner\'s phone feed as incoming from Diego', f2 && f2.incoming && f2.from_name === 'Diego' && f2.name === 'foto ñ.png', JSON.stringify(f2));
check('owner can download it', (await call(`/api/items/${s2.data.ids[0]}`, { token: OWNER })).data === 'PNGDATA');
const diegoFeed = await call('/api/items', { token: DIEGO });
check('it is not in Diego\'s phone feed (sent from his laptop)', !diegoFeed.data.some((i) => i.id === s2.data.ids[0]));

// Owner's phone -> own laptop, the old way (no from/user params)
const s3 = await call('/api/send?to=laptop', { token: OWNER, method: 'POST', body: 'note to self', headers: { 'x-kind': 'text' } });
const ownerPending = await call('/api/pending', { token: OWNER });
check('old-style send to own laptop still works', ownerPending.data.some((i) => i.id === s3.data.ids[0] && i.from_user === owner.id));
check('Diego can\'t read the owner\'s item', (await call(`/api/items/${s3.data.ids[0]}`, { token: DIEGO })).status === 404);
check('Diego can\'t delete the owner\'s item', (await call(`/api/items/${s3.data.ids[0]}`, { token: DIEGO, method: 'DELETE' })).status === 404);
check('sending to a device you\'re sending from is refused', (await call('/api/send?to=laptop&from=laptop', { token: OWNER, method: 'POST', body: 'x', headers: { 'x-kind': 'text' } })).status === 400);
check('sending to a non-user is refused', (await call('/api/send?to=laptop&user=ffff', { token: OWNER, method: 'POST', body: 'x', headers: { 'x-kind': 'text' } })).status === 404);

// Acks
await call(`/api/items/${s1.data.ids[0]}/ack`, { token: OWNER, method: 'POST' });
check('sender\'s ack does not mark delivered', (await call('/api/pending', { token: DIEGO })).data.some((i) => i.id === s1.data.ids[0]));
await call(`/api/items/${s1.data.ids[0]}/ack`, { token: DIEGO, method: 'POST' });
check('recipient\'s ack does', !(await call('/api/pending', { token: DIEGO })).data.some((i) => i.id === s1.data.ids[0]));

// Pairing Diego's phone
const before = (await call('/api/status', { token: DIEGO })).data.devices;
const pc = await call('/api/pair/start', { token: DIEGO, method: 'POST' });
check('pair code made', /^\d{6}$/.test(pc.data.code), JSON.stringify(pc.data));
const wrong = await call('/api/pair/claim', { method: 'POST', body: { code: pc.data.code === '000000' ? '000001' : '000000' } });
check('wrong pair code refused', wrong.status === 400);
const claim = await call('/api/pair/claim', { method: 'POST', body: { code: pc.data.code } });
check('pair code gives Diego a token', claim.status === 200 && claim.data.user.id === diego.id, JSON.stringify(claim.data));
const phone = await call('/api/status', { token: claim.data.token });
check('the phone is signed in as Diego', phone.data.me.id === diego.id);
check('device count went up', phone.data.devices === before + 1, `${before} -> ${phone.data.devices}`);
check('pair code is single use', (await call('/api/pair/claim', { method: 'POST', body: { code: pc.data.code } })).status === 400);

// Renaming
await call('/api/me', { token: DIEGO, method: 'POST', body: { name: 'Diego G' } });
check('rename shows up for friends', (await call('/api/friends', { token: OWNER })).data.some((f) => f.id === diego.id && f.name === 'Diego G'));

// WebSocket ping + presence
const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/api/ws?t=' + DIEGO);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const online = await call('/api/friends', { token: OWNER });
check('Diego\'s laptop shows online when connected', online.data.find((f) => f.id === diego.id).laptop === true);
const msg = new Promise((r) => { ws.onmessage = (e) => r(String(e.data)); });
await call(`/api/send?to=laptop&user=${diego.id}&from=phone`, { token: OWNER, method: 'POST', body: 'ping', headers: { 'x-kind': 'text' } });
check('Diego\'s laptop is told about new items live', (await msg).includes('"item"'));
ws.close();

console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
