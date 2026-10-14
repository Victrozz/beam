const $ = (s, root = document) => root.querySelector(s);
const PREFETCH_MAX = 20 * 1024 * 1024;

// ---------- icons ----------
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  arrowUp: P('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
  arrowDown: P('<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>'),
  inbox: P('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.6 5h12.8L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>'),
  send: P('<path d="M21.5 2.5 10.6 13.4"/><path d="M21.5 2.5 14.6 21l-4-7.6-7.6-4z"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  clipboard: P('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  text: P('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  camera: P('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  copy: P('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  download: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'),
  share: P('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4M12 2v13"/>'),
  plusSquare: P('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>'),
  appIcon: P('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 16V8M9 11l3-3 3 3"/>'),
  trash: P('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  external: P('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>'),
  check: P('<path d="M20 6 9 17l-5-5"/>'),
  x: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  chevron: P('<path d="m9 6 6 6-6 6"/>'),
  bell: P('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  spark: P('<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>'),
  laptop: P('<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>'),
  unlink: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  globe: P('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>'),
  alert: P('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  phone: P('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
};
function paintIcons(root = document) {
  for (const n of root.querySelectorAll('[data-icon]')) {
    if (!n.firstElementChild && ICONS[n.dataset.icon]) n.insertAdjacentHTML('afterbegin', ICONS[n.dataset.icon]);
  }
}

// ---------- state ----------
const state = {
  token: load('beam.token'),
  items: [],
  blobs: new Map(), // id -> { blob, url } so Save opens the share sheet instantly (iOS needs the tap)
  highlight: new URLSearchParams(location.search).get('item'),
  tab: new URLSearchParams(location.search).get('item') ? 'inbox' : 'send',
  filter: 'all',
  lastSeen: Number(load('beam.lastSeen') || 0),
  skipInstall: false,
  viewing: null,
  status: null,
  target: load('beam.target') || 'self:laptop', // "<userId|self>:<laptop|phone>"
};
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${state.token}` } });
  if (res.status === 401) { unpair(); throw new Error('This phone is no longer paired'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res;
}

// ---------- routing ----------
function showScreen(id) { for (const s of ['install', 'pair', 'main']) $('#' + s).hidden = s !== id; }

// The laptop's setup shows a QR code that opens Beam with the pairing code filled in.
const pairParam = new URLSearchParams(location.search).get('pair');
if (pairParam) { $('#code').value = pairParam.replace(/\D/g, '').slice(0, 6); history.replaceState(null, '', '/'); }

function route() {
  if (isIOS && !standalone && !state.skipInstall && !state.token) return showScreen('install');
  if (!state.token) return showScreen('pair');
  showScreen('main');
  setTab(state.tab);
  refresh();
  refreshStatus();
  setupNotifications();
}

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const t of ['inbox', 'send', 'settings']) $('#tab-' + t).hidden = t !== tab;
  if (tab === 'inbox') markSeen();
  window.scrollTo(0, 0);
}

// ---------- pairing ----------
async function pair() {
  const code = $('#code').value.replace(/\D/g, '');
  if (code.length !== 6) return toast('Enter the 6-digit code');
  $('#pairBtn').disabled = true;
  try {
    const res = await fetch('/api/pair/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pairing failed');
    state.token = data.token;
    store('beam.token', data.token);
    toast('Paired ✓');
    route();
  } catch (e) {
    toast(e.message);
  } finally {
    $('#pairBtn').disabled = false;
  }
}

function unpair() {
  state.token = null;
  store('beam.token', null);
  route();
}

// ---------- notifications ----------
function b64uToBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function subscribe() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await (await fetch('/api/vapid')).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
  }
  await api('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
}

function setupNotifications() {
  const sub = $('#notifSub');
  const btn = $('#notifBtn');
  btn.hidden = true;
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
    sub.textContent = isIOS && !standalone ? 'Open Beam from your Home Screen to enable' : 'Not supported in this browser';
    return;
  }
  if (Notification.permission === 'granted') {
    sub.textContent = 'On';
    subscribe().catch(() => { sub.textContent = 'On, but registration failed. Reopen the app'; });
  } else if (Notification.permission === 'denied') {
    sub.textContent = 'Blocked. Turn on in iPhone Settings → Notifications → Beam';
  } else {
    sub.textContent = 'Off';
    btn.hidden = false;
  }
}

async function enableNotifications() {
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') { await subscribe(); toast('Notifications on ✓'); }
  } catch (e) {
    toast(e.message);
  }
  setupNotifications();
}

// ---------- laptop status ----------
async function refreshStatus() {
  if (!state.token || document.hidden) return;
  try {
    state.status = await (await api('/api/status')).json();
  } catch {
    state.status = null;
  }
  const online = state.status?.laptopOnline;
  $('#laptopSub').textContent = !state.status ? 'Can\'t reach the server' : online ? 'Online, receives instantly' : 'Offline. Things wait up to 24 h until it\'s back';
  if (state.status) {
    $('#meName').textContent = `Signed in as ${state.status.me.name}`;
    const names = state.status.friends.map((f) => f.name);
    $('#friendsSub').textContent = names.length ? `Friends on Beam: ${names.join(', ')}` : 'No friends yet. Invite someone from Beam on your laptop';
    if (state.items.length) render(); // names in the feed depend on who "me" is
  }
  renderTargets();
}

// ---------- who to send to ----------
function targets() {
  const list = [{ key: 'self:laptop', user: null, to: 'laptop', label: 'My laptop', icon: 'laptop', online: state.status?.laptopOnline }];
  for (const f of state.status?.friends || []) {
    list.push({ key: `${f.id}:laptop`, user: f, to: 'laptop', label: `${f.name}'s laptop`, icon: 'laptop', online: f.laptop });
    list.push({ key: `${f.id}:phone`, user: f, to: 'phone', label: `${f.name}'s phone`, icon: 'phone', online: f.phone });
  }
  return list;
}
function currentTarget() {
  const list = targets();
  return list.find((t) => t.key === state.target) || list[0];
}

function renderTargets() {
  const list = targets();
  const cur = currentTarget();
  const box = $('#targets');
  box.hidden = list.length < 2;
  box.innerHTML = list.map((t) => `<button class="target${t.key === cur.key ? ' on' : ''}" data-key="${esc(t.key)}">
    <span data-icon="${t.icon}"></span><span>${esc(t.label)}</span><i class="${t.online ? 'on' : ''}"></i></button>`).join('');
  paintIcons(box);
  $('#heroTitle').textContent = cur.user ? `Send to ${cur.label}` : 'Send to laptop';
  const pill = $('#laptopPill');
  pill.className = 'pill ' + (state.status ? (cur.online ? 'on' : 'off') : '');
  pill.lastElementChild.textContent = !state.status ? 'No connection'
    : cur.to === 'phone' ? (cur.online ? 'Notifications on' : 'Notifications off')
      : `Laptop ${cur.online ? 'online' : 'offline'}`;
}

// ---------- feed ----------
const ago = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
};
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

async function refresh() {
  if (!state.token || document.hidden) return;
  try {
    state.items = await (await api('/api/items')).json();
    render();
    updateBadge();
    for (const item of state.items) {
      if (item.kind === 'file' && item.size <= PREFETCH_MAX && !state.blobs.has(item.id)) prefetch(item);
    }
  } catch (e) {
    console.warn(e);
  }
}

async function prefetch(item) {
  state.blobs.set(item.id, null);
  try {
    const blob = await (await api(`/api/items/${item.id}`)).blob();
    state.blobs.set(item.id, { blob, url: URL.createObjectURL(blob) });
    render();
  } catch {
    state.blobs.delete(item.id);
  }
}

function markSeen() {
  const newest = Math.max(0, ...state.items.filter((i) => i.incoming).map((i) => i.created));
  if (newest > state.lastSeen) { state.lastSeen = newest; store('beam.lastSeen', String(newest)); }
  updateBadge();
}

function updateBadge() {
  if (state.tab === 'inbox') { const n = state.items.some((i) => i.incoming && i.created > state.lastSeen); if (n) return markSeen(); }
  const unseen = state.items.filter((i) => i.incoming && i.created > state.lastSeen).length;
  const badge = $('#badge');
  badge.hidden = !unseen;
  badge.textContent = unseen > 9 ? '9+' : unseen;
}

function render() {
  const live = new Set(state.items.map((i) => i.id));
  for (const [id, b] of state.blobs) if (!live.has(id)) { if (b) URL.revokeObjectURL(b.url); state.blobs.delete(id); }

  const items = state.items.filter((i) => state.filter === 'all' || (state.filter === 'in') === i.incoming);
  const feed = $('#feed');
  if (!items.length) {
    feed.innerHTML = `<div class="empty"><div class="empty-ico" data-icon="inbox"></div><b>${state.filter === 'out' ? 'Nothing sent yet' : 'Nothing here yet'}</b>
      ${state.filter === 'out' ? 'Things you send from this phone show up here.' : 'Press Ctrl+Alt+B on your laptop and drop a file.'}</div>`;
    paintIcons(feed);
    return;
  }
  let html = '';
  let lastDay = '';
  for (const item of items) {
    const day = dayLabel(item.created);
    if (day !== lastDay) { html += `<div class="day">${day}</div>`; lastDay = day; }
    html += itemHtml(item);
  }
  feed.innerHTML = html;
  paintIcons(feed);
  if (state.highlight) {
    const target = feed.querySelector(`[data-id="${state.highlight}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => target.classList.remove('highlight'), 2500);
      state.highlight = null;
      history.replaceState(null, '', '/');
    }
  }
}

function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long' });
}

function itemHtml(item) {
  const incoming = item.incoming;
  const b = state.blobs.get(item.id);
  const mine = (u) => u === state.status?.me.id;
  const dir = incoming
    ? `<span class="dir" data-icon="arrowDown">${mine(item.from_user) ? 'From laptop' : `From ${esc(item.from_name)}`}</span>`
    : `<span class="dir out" data-icon="arrowUp">${mine(item.to_user) ? 'Sent' : `To ${esc(item.to_name)}${item.to_dev === 'phone' ? '\'s phone' : ''}`}</span>`;
  const status = incoming || item.to_dev === 'phone' ? ''
    : item.delivered ? `<span class="status ok">${mine(item.to_user) ? 'On laptop' : 'Delivered'} ✓</span>` : '<span class="status wait">Waiting for laptop</span>';
  const meta = `<div class="meta">${dir}<span>${ago(item.created)}</span>${status}</div>`;
  const del = `<button class="icon-btn" data-act="delete" data-icon="trash" aria-label="Delete"></button>`;
  let body = '';
  let thumb = '';
  if (item.kind === 'text') {
    const isUrl = /^https?:\/\/\S+$/.test(item.text.trim());
    body = `<p class="text">${esc(item.text)}</p><div class="actions">
      <button class="btn" data-act="copy"><span data-icon="copy"></span>Copy</button>
      ${isUrl ? '<button class="btn" data-act="open"><span data-icon="external"></span>Open</button>' : ''}${del}</div>`;
  } else {
    if (b && item.mime.startsWith('image/')) thumb = `<img class="thumb" data-act="view" src="${b.url}" alt="${esc(item.name)}">`;
    const ext = esc((item.name.includes('.') ? item.name.split('.').pop() : 'file').slice(0, 4));
    const info = thumb
      ? `<div class="fline"><span class="fname">${esc(item.name)}</span><span class="fsize">${fmtSize(item.size)}</span></div>`
      : `<div class="file"><div class="ext">${ext}</div><div><div class="fname">${esc(item.name)}</div><div class="fsize">${fmtSize(item.size)}</div></div></div>`;
    body = `${info}
      <div class="actions">${incoming || b ? `<button class="btn ${incoming ? 'primary' : ''}" data-act="save" ${b ? '' : 'disabled'}>
      <span data-icon="download"></span>${b ? 'Save / Share' : 'Loading…'}</button>` : ''}${del}</div>`;
  }
  return `<article class="item${item.id === state.highlight ? ' highlight' : ''}" data-id="${item.id}">${thumb}<div class="body">${meta}${body}</div></article>`;
}

function itemById(id) { return state.items.find((i) => i.id === id); }

function save(item) {
  const b = state.blobs.get(item.id);
  if (!b) return toast('Still loading…');
  const file = new File([b.blob], item.name, { type: item.mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch((e) => { if (e.name !== 'AbortError') toast(e.message); });
  } else {
    Object.assign(document.createElement('a'), { href: b.url, download: item.name }).click();
  }
}

async function remove(item) {
  try {
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    state.items = state.items.filter((i) => i.id !== item.id);
    render();
    updateBadge();
  } catch (e) {
    toast(e.message);
  }
}

function openViewer(item) {
  const b = state.blobs.get(item.id);
  if (!b) return;
  state.viewing = item;
  $('#viewerImg').src = b.url;
  $('#viewer').hidden = false;
}

// ---------- sending ----------
let uploadSeq = 0;
function uploadRow(name) {
  const id = 'u' + ++uploadSeq;
  $('#uploads').insertAdjacentHTML('afterbegin', `<div class="upload" id="${id}"><div class="u-main"><div class="u-name">${esc(name)}</div>
    <div class="u-sub">Sending…</div><div class="bar"><i></i></div></div><div class="u-state"><div class="spinner"></div></div></div>`);
  const row = $('#' + id);
  return {
    progress(p) { row.querySelector('.bar i').style.width = `${Math.round(p * 100)}%`; },
    done(note) {
      row.classList.add('done');
      row.querySelector('.u-sub').textContent = note;
      row.querySelector('.bar').remove();
      row.querySelector('.u-state').innerHTML = ICONS.check;
      setTimeout(() => { row.style.transition = 'opacity .4s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 400); }, 6000);
    },
    fail(msg, retry) {
      row.classList.add('fail');
      row.querySelector('.u-sub').textContent = msg + ' · tap to retry';
      row.querySelector('.u-state').innerHTML = ICONS.alert;
      row.onclick = () => { row.remove(); retry(); };
    },
  };
}

// XHR instead of fetch so we get upload progress.
function post(target, body, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/send?to=${target.to}&from=phone${target.user ? `&user=${encodeURIComponent(target.user.id)}` : ''}`);
    xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) { unpair(); reject(new Error('Not paired')); }
      else if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('No connection'));
    xhr.send(body);
  });
}

function deliveredNote(target, data) {
  if (target.to === 'phone') return data.pushed ? `Sent to ${target.label}` : `Sent. ${target.user.name} has notifications off, they'll see it in Beam`;
  if (!target.user) return data.laptopOnline ? 'Sent to laptop' : 'Saved. Laptop is offline, it\'ll get it later';
  return data.laptopOnline ? `Sent to ${target.label}` : `Saved. ${target.label} is offline, it'll get it later`;
}

async function sendFile(f, target = currentTarget()) {
  const row = uploadRow(f.name);
  try {
    const data = await post(target, f, { 'X-Name': encodeURIComponent(f.name), 'X-Kind': 'file', 'Content-Type': f.type || 'application/octet-stream' }, row.progress);
    row.done(deliveredNote(target, data));
  } catch (e) {
    row.fail(e.message, () => sendFile(f, target));
  }
}

async function sendFiles(files) {
  const target = currentTarget();
  for (const f of [...files]) await sendFile(f, target);
  refresh();
}

async function sendText(text, target = currentTarget()) {
  if (!text.trim()) return false;
  const row = uploadRow(text.length > 40 ? text.slice(0, 40) + '…' : text);
  try {
    const data = await post(target, text, { 'X-Kind': 'text', 'Content-Type': 'text/plain; charset=utf-8' });
    row.done(deliveredNote(target, data));
    refresh();
    return true;
  } catch (e) {
    row.fail(e.message, () => sendText(text, target));
    return false;
  }
}

// ---------- wiring ----------
paintIcons();
$('#skipInstall').onclick = () => { state.skipInstall = true; route(); };
$('#pairBtn').onclick = pair;
$('#code').addEventListener('input', (e) => { if (e.target.value.replace(/\D/g, '').length === 6) pair(); });
$('#notifBtn').onclick = enableNotifications;
$('#targets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (!b) return;
  state.target = b.dataset.key;
  store('beam.target', state.target);
  renderTargets();
});
for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => setTab(b.dataset.tab);
for (const b of document.querySelectorAll('#filter button')) {
  b.onclick = () => {
    state.filter = b.dataset.filter;
    for (const o of document.querySelectorAll('#filter button')) o.classList.toggle('on', o === b);
    render();
  };
}

for (const id of ['#fileInput', '#cameraInput']) {
  $(id).onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) sendFiles(files); };
}
const textBox = $('#text');
$('#textBtn').onclick = () => { $('#composer').hidden = false; textBox.focus(); };
$('#cancelText').onclick = () => { $('#composer').hidden = true; textBox.value = ''; $('#sendTextBtn').disabled = true; };
textBox.addEventListener('input', () => { $('#sendTextBtn').disabled = !textBox.value.trim(); });
$('#sendTextBtn').onclick = async () => {
  const text = textBox.value;
  $('#cancelText').click();
  await sendText(text);
};
$('#pasteBtn').onclick = async () => {
  try {
    // Pasting an image from the clipboard (e.g. a screenshot) works too where the browser allows it.
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          return sendFiles([new File([blob], `pasted-${Date.now()}.${type.split('/')[1]}`, { type })]);
        }
      }
    }
    const text = await navigator.clipboard.readText();
    if (!text) return toast('Clipboard is empty');
    await sendText(text);
  } catch {
    toast('Couldn\'t read the clipboard');
  }
};

$('#feed').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const item = itemById(btn.closest('[data-id]').dataset.id);
  if (!item) return;
  const act = btn.dataset.act;
  if (act === 'save') save(item);
  else if (act === 'view') openViewer(item);
  else if (act === 'delete') remove(item);
  else if (act === 'copy') navigator.clipboard.writeText(item.text).then(() => toast('Copied ✓'), () => toast('Couldn\'t copy'));
  else if (act === 'open') window.open(item.text.trim(), '_blank');
});

$('#viewerClose').onclick = () => { $('#viewer').hidden = true; state.viewing = null; };
$('#viewerSave').onclick = () => state.viewing && save(state.viewing);

$('#testBtn').onclick = async () => {
  try {
    const { sent } = await (await api('/api/test-push', { method: 'POST' })).json();
    toast(sent ? 'Sent! Check your notifications' : 'Turn on notifications first');
  } catch (e) {
    toast(e.message);
  }
};
$('#guideBtn').onclick = () => { $('#guide').hidden = false; };
$('#guideClose').onclick = () => { $('#guide').hidden = true; };
$('#copyLinkBtn').onclick = () => {
  const link = `${location.origin}/api/send?to=laptop&t=${encodeURIComponent(state.token)}`;
  navigator.clipboard.writeText(link).then(() => toast('Link copied ✓'), () => toast('Couldn\'t copy'));
};
$('#unpairBtn').onclick = () => { if (confirm('Unpair this phone? You\'ll need a new code from the laptop.')) unpair(); };

document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); refreshStatus(); } });
setInterval(refresh, 8000);
setInterval(refreshStatus, 20000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open') { state.highlight = e.data.id; setTab('inbox'); }
    refresh();
  });
}

route();
