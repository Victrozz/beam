// Beam desktop: tray app with a docked panel (drop zone + history + settings) and a first-run setup window.
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, clipboard, nativeImage,
  shell, Notification, powerMonitor, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { fileURLToPath } = require('url');
const qrcode = require('qrcode-generator');

const ROOT = process.env.BEAM_HOME || path.join(process.env.LOCALAPPDATA, 'Beam');
const SANDBOX = !!process.env.BEAM_HOME; // a test copy: leaves the real shortcuts, startup entry and hotkey alone
const INBOX = path.join(ROOT, 'Inbox');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const HISTORY_PATH = path.join(ROOT, 'history.json');
const ASSETS = path.join(__dirname, 'assets');
const DEFAULT_SERVER = require('./package.json').beamServer;
const AUMID = 'app.beam.desktop';
const MAX_SIZE = 50 * 1024 * 1024;
const RETENTION_MS = 30 * 24 * 3600 * 1000;

app.setPath('userData', path.join(ROOT, 'data'));
app.setAppUserModelId(AUMID);
app.disableHardwareAcceleration(); // a small panel renders fine in software and saves the ~150 MB GPU process
const primary = app.requestSingleInstanceLock(); // a second launch hands its argv to the running one
if (!primary) app.exit(0);

// ---------- config & history ----------
let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, '')); } catch { config = {}; }
  config.hotkey ||= 'Ctrl+Alt+B';
  config.copyText ??= true;
  config.notify ??= true;
  config.target ||= 'self:phone';
  if (config.server) config.server = config.server.replace(/\/+$/, '');
}
function saveConfig() {
  const { server, token, hotkey, copyText, notify, target, me } = config;
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ server, token, hotkey, copyText, notify, target, me }, null, 2));
}
const isSetUp = () => !!(config.server && config.token);

let history = [];
let saveTimer;
function loadHistory() {
  try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { history = []; }
  // Sends interrupted by a quit can't be resumed; show them as failed so they can be retried.
  for (const h of history) if (h.status === 'sending') { h.status = 'failed'; h.error = 'Interrupted'; }
  const cutoff = Date.now() - RETENTION_MS;
  for (const h of history.filter((h) => h.time < cutoff && h.dir === 'in' && h.path)) fs.rm(h.path, { force: true }, () => {});
  history = history.filter((h) => h.time >= cutoff);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(HISTORY_PATH, JSON.stringify(history), () => {}), 300);
  pushState();
}
const newId = () => crypto.randomBytes(6).toString('hex');

// ---------- state shared with the panel ----------
const status = { conn: 'connecting', phoneSubs: null, friends: [] };

// Where things go: your own phone, or a friend's laptop or phone. Keys look like "self:phone" or "<userId>:laptop".
function targets() {
  const list = [{ key: 'self:phone', user: null, to: 'phone', label: 'My phone', short: 'your phone', online: status.phoneSubs > 0 }];
  for (const f of status.friends) {
    list.push({ key: `${f.id}:laptop`, user: f.id, name: f.name, to: 'laptop', label: `${f.name}'s laptop`, short: `${f.name}'s laptop`, online: f.laptop });
    list.push({ key: `${f.id}:phone`, user: f.id, name: f.name, to: 'phone', label: `${f.name}'s phone`, short: `${f.name}'s phone`, online: f.phone });
  }
  return list;
}
function targetFor(key) {
  const list = targets();
  return list.find((t) => t.key === key) || list[0];
}

function snapshot() {
  return {
    history: history.slice(0, 200),
    status,
    me: config.me || null,
    targets: targets(),
    target: targetFor(config.target).key,
    unread: history.filter((h) => h.dir === 'in' && !h.seen).length,
    settings: {
      hotkey: config.hotkey, hotkeyOk: hotkeyOk, copyText: config.copyText, notify: config.notify,
      startup: app.getLoginItemSettings(loginOpts()).openAtLogin, server: config.server, inbox: INBOX,
    },
  };
}
function pushState() {
  send('state', snapshot());
  updateTray();
}

// ---------- panel window ----------
const MARGIN = 18;           // transparent room around the card for its shadow
const FULL = { w: 384, h: 576 };
const COMPACT = { w: 288, h: 176 };
let win;
let mode = 'hidden';         // hidden | full | compact
let anchor;                  // work area the panel is docked to

function boundsFor(size) {
  const W = size.w + MARGIN * 2, H = size.h + MARGIN * 2;
  return { x: anchor.x + anchor.width - W, y: anchor.y + anchor.height - H, width: W, height: H };
}

const alive = () => win && !win.isDestroyed();
function send(channel, msg) { if (alive()) win.webContents.send(channel, msg); }

// The panel's page is only kept while it's in use; an idle tray app shouldn't hold a renderer.
let windowReady = null;
function ensureWindow() {
  if (alive() && windowReady) return windowReady;
  win = new BrowserWindow({
    width: FULL.w + MARGIN * 2, height: FULL.h + MARGIN * 2, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, title: 'Beam',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.on('blur', () => { if (mode === 'full') send('ui', { type: 'blur' }); });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); hidePanel(); } });
  win.on('closed', () => { win = null; windowReady = null; });
  win.webContents.on('will-navigate', (e) => e.preventDefault()); // dropping a file must never navigate away
  windowReady = new Promise((resolve) => win.webContents.once('did-finish-load', () => { send('state', snapshot()); resolve(); }));
  win.loadFile(path.join(__dirname, 'ui', 'panel.html'));
  return windowReady;
}

let unloadTimer = null;
async function showPanel(which = 'full', { focus = true, highlight } = {}) {
  clearTimeout(unloadTimer);
  await ensureWindow();
  if (mode === 'hidden') anchor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const wasHidden = mode === 'hidden';
  mode = which;
  win.setBounds(boundsFor(which === 'full' ? FULL : COMPACT));
  send('ui', { type: wasHidden ? 'open' : 'expand', mode: which, highlight });
  if (focus) { win.show(); win.focus(); } else if (!win.isVisible()) win.showInactive();
  if (which === 'full') markSeen();
}

function hidePanel() {
  if (mode === 'hidden') return;
  mode = 'hidden';
  send('ui', { type: 'close' });
  setTimeout(() => { if (mode === 'hidden' && alive()) win.hide(); }, 190);
  clearTimeout(unloadTimer);
  unloadTimer = setTimeout(() => {
    if (mode === 'hidden' && !sending && alive()) win.destroy();
  }, 60000);
}

function togglePanel() {
  if (mode === 'full' && alive() && win.isFocused()) hidePanel();
  else showPanel('full');
}

function markSeen() {
  let changed = false;
  for (const h of history) if (h.dir === 'in' && !h.seen) { h.seen = true; changed = true; }
  if (changed) persist();
}

// ---------- tray ----------
let tray;
function updateTray() {
  if (!tray) return;
  const unread = history.some((h) => h.dir === 'in' && !h.seen);
  const online = status.conn === 'online' || status.conn === 'polling';
  tray.setImage(path.join(ASSETS, !online ? 'tray-off.ico' : unread ? 'tray-unread.ico' : 'tray-on.ico'));
  tray.setToolTip(!isSetUp() ? 'Beam · Not set up yet' : `Beam · ${online ? 'Connected' : status.conn === 'connecting' ? 'Connecting…' : 'Offline'}`);
}
function createTray() {
  tray = new Tray(path.join(ASSETS, 'tray-off.ico'));
  tray.on('click', () => (isSetUp() ? togglePanel() : openSetup()));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Beam', click: () => (isSetUp() ? showPanel('full') : openSetup()) },
    { label: 'Received files folder', click: () => shell.openPath(INBOX) },
    { type: 'separator' },
    { label: 'Quit Beam', click: quit },
  ]));
  updateTray();
}

// ---------- hotkey ----------
let hotkeyOk = false;
const toAccelerator = (s) => s.split('+').map((p) => p.trim()).map((p) => /^win$/i.test(p) ? 'Super' : p).join('+');
function registerHotkey(spec) {
  globalShortcut.unregisterAll();
  try { hotkeyOk = globalShortcut.register(toAccelerator(spec), () => (isSetUp() ? togglePanel() : openSetup())); } catch { hotkeyOk = false; }
  return hotkeyOk;
}

// ---------- server API ----------
async function api(p, opts = {}) {
  if (!isSetUp()) throw new Error('Beam isn\'t set up yet');
  let res;
  try {
    res = await fetch(config.server + p, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${config.token}` } });
  } catch {
    throw new Error('No connection');
  }
  if (res.status === 401) throw new Error('This laptop was signed out of Beam');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res;
}

// ---------- sending ----------
const queue = [];
let sending = false;

function enqueue(job, target) {
  const entry = { id: newId(), dir: 'out', time: Date.now(), status: 'sending', ...job.entry };
  if (target.user) Object.assign(entry, { toKey: target.key, toLabel: target.label });
  history.unshift(entry);
  queue.push({ entry, load: job.load, target });
  persist();
  pump();
}

async function pump() {
  if (sending) return;
  sending = true;
  while (queue.length) {
    const { entry, load, target } = queue.shift();
    try {
      const { body, headers } = await load();
      if (Buffer.isBuffer(body)) entry.size = body.length; // zips only know their size once built
      const res = await api(`/api/send?to=${target.to}&from=laptop${target.user ? `&user=${encodeURIComponent(target.user)}` : ''}`, { method: 'POST', body, headers });
      const data = await res.json();
      entry.status = 'sent';
      entry.warn = data.pushed === 0
        ? (target.user ? `${target.name} has notifications off, they'll see it when they open Beam` : 'Your phone won\'t be notified. Turn on notifications in Beam on the phone')
        : data.laptopOnline === false ? `${target.label} is offline. It'll arrive when it's back on (within 24 h)` : null;
      if (data.pushed !== undefined && !target.user) status.phoneSubs = data.pushed;
    } catch (e) {
      entry.status = 'failed';
      entry.error = e.message;
    }
    persist();
    send('ui', { type: 'sent', id: entry.id, ok: entry.status === 'sent' });
  }
  sending = false;
}

const mimeOf = (name) => ({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', zip: 'application/zip',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream');

const fileHeaders = (name, mime) => ({ 'X-Kind': 'file', 'X-Name': encodeURIComponent(name), 'Content-Type': mime });

function zipFolder(dir) {
  // bsdtar reads "C:\..." in -f as host:path, so give it a name relative to its cwd.
  const name = `beam-${newId()}.zip`;
  return new Promise((resolve, reject) => {
    execFile('tar.exe', ['-a', '-c', '-f', name, '-C', path.dirname(dir), path.basename(dir)], { windowsHide: true, cwd: os.tmpdir() }, (err) => {
      if (err) reject(new Error('Couldn\'t zip the folder')); else resolve(path.join(os.tmpdir(), name));
    });
  });
}

async function sendPaths(paths, target = targetFor(config.target)) {
  for (const p of paths) {
    let stat;
    try { stat = await fsp.stat(p); } catch { continue; }
    if (stat.isDirectory()) {
      const name = path.basename(p) + '.zip';
      enqueue({
        entry: { kind: 'file', name, mime: 'application/zip', size: 0 },
        load: async () => {
          const zip = await zipFolder(p);
          try {
            const body = await fsp.readFile(zip);
            if (body.length > MAX_SIZE) throw new Error('Over 50 MB, too big');
            return { body, headers: fileHeaders(name, 'application/zip') };
          } finally { fs.rm(zip, { force: true }, () => {}); }
        },
      }, target);
    } else {
      const name = path.basename(p);
      const mime = mimeOf(name);
      enqueue({
        entry: { kind: 'file', name, mime, size: stat.size, path: p },
        load: async () => {
          if (stat.size > MAX_SIZE) throw new Error('Over 50 MB, too big');
          return { body: await fsp.readFile(p), headers: fileHeaders(name, mime) };
        },
      }, target);
    }
  }
}

function sendBuffer(name, mime, buf) {
  // Pasted screenshots have no file on disk; keep a copy so the history can show and re-send it.
  const file = uniquePath(path.join(INBOX, 'sent'), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  enqueue({
    entry: { kind: 'file', name, mime, size: buf.length, path: file },
    load: async () => ({ body: buf, headers: fileHeaders(name, mime) }),
  }, targetFor(config.target));
}

function sendText(text, target = targetFor(config.target)) {
  if (!text || !text.trim()) return;
  enqueue({
    entry: { kind: 'text', text, size: text.length },
    load: async () => ({ body: text, headers: { 'X-Kind': 'text', 'Content-Type': 'text/plain; charset=utf-8' } }),
  }, target);
}

function retry(entry) {
  history = history.filter((h) => h !== entry);
  const target = targetFor(entry.toKey || 'self:phone');
  if (entry.kind === 'text') sendText(entry.text, target);
  else if (entry.path) sendPaths([entry.path], target);
  persist();
}

// Clipboard → files (Explorer copy), image (screenshot) or text.
function clipboardFiles() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'],
    { windowsHide: true, encoding: 'utf8' }, (err, out) => {
      resolve(err ? [] : out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
}
async function paste() {
  let items = [];
  try { items = await clipboard.read(); } catch {}
  const types = items.flatMap((i) => i.types);

  const imgItem = items.find((i) => i.types.some((t) => t.startsWith('image/')));
  if (imgItem) {
    const type = imgItem.types.find((t) => t.startsWith('image/'));
    const buf = Buffer.from(await (await imgItem.getType(type)).arrayBuffer());
    const d = new Date();
    const stamp = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[:T]/g, '-'); // local time
    sendBuffer(`screenshot-${stamp}.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`, type, buf);
    return 'image';
  }
  const uriItem = items.find((i) => i.types.includes('text/uri-list'));
  if (uriItem) {
    const uris = (await (await uriItem.getType('text/uri-list')).text()).split(/\r?\n/).filter((u) => u.startsWith('file:'));
    const paths = uris.map((u) => { try { return fileURLToPath(u); } catch { return null; } }).filter(Boolean);
    if (paths.length) { sendPaths(paths); return 'files'; }
  }
  if (types.includes('text/plain')) {
    const text = await clipboard.readText();
    if (text.trim()) { sendText(text); return 'text'; }
  }
  // Files copied in Explorer may not surface through the web-style API; ask Windows directly.
  const files = await clipboardFiles();
  if (files.length) { sendPaths(files); return 'files'; }
  return 'empty';
}

// ---------- receiving ----------
let ws = null, reconnectTimer = null, backoff = 2, lastRx = 0, fetching = null, presenceTimer = null;

function setConn(c) {
  if (status.conn !== c) { status.conn = c; pushState(); }
}

function connect() {
  clearTimeout(reconnectTimer);
  if (!isSetUp()) return setConn('offline');
  const url = config.server.replace(/^http/, 'ws') + '/api/ws?t=' + encodeURIComponent(config.token);
  let sock;
  try { sock = new WebSocket(url); } catch { return scheduleReconnect(); }
  ws = sock;
  sock.onopen = () => { if (ws !== sock) return; backoff = 2; lastRx = Date.now(); setConn('online'); fetchPending(); refreshStatus(); };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    lastRx = Date.now();
    const msg = String(e.data);
    if (msg.includes('"item"')) fetchPending();
    else if (msg.includes('"presence"')) { clearTimeout(presenceTimer); presenceTimer = setTimeout(refreshStatus, 1000); }
  };
  sock.onclose = sock.onerror = () => { if (ws !== sock) return; ws = null; if (status.conn === 'online') setConn('connecting'); scheduleReconnect(); };
}
function dropSocket() {
  const sock = ws;
  ws = null;
  if (sock) try { sock.close(); } catch {}
  scheduleReconnect(0.5);
}
function scheduleReconnect(sec) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, (sec ?? backoff) * 1000);
  if (sec === undefined) backoff = Math.min(backoff * 2, 30);
}
// Keepalive; a socket that stops answering (Wi-Fi switch, sleep) gets replaced.
setInterval(() => {
  if (!ws || ws.readyState !== 1) return;
  if (Date.now() - lastRx > 70000) return dropSocket();
  try { ws.send('ping'); } catch {}
}, 25000);
// Fallback for networks that block WebSockets: poll while the socket is down.
setInterval(async () => {
  if (ws && ws.readyState === 1) return;
  const ok = await fetchPending();
  setConn(ok ? 'polling' : 'offline');
}, 20000);

async function refreshStatus() {
  try {
    const s = await (await api('/api/status')).json();
    status.phoneSubs = s.subs;
    status.friends = s.friends || [];
    if (s.me && JSON.stringify(s.me) !== JSON.stringify(config.me)) { config.me = s.me; saveConfig(); }
    pushState();
    syncSendTo();
  } catch {}
}
setInterval(refreshStatus, 5 * 60 * 1000);

function fetchPending() {
  if (!fetching) fetching = doFetchPending().finally(() => { fetching = null; });
  return fetching;
}

async function doFetchPending() {
  let list;
  try { list = await (await api('/api/pending')).json(); } catch { return false; }
  for (const item of list) {
    try {
      if (history.some((h) => h.serverId === item.id)) { await api(`/api/items/${item.id}/ack`, { method: 'POST' }); continue; }
      const entry = { id: newId(), serverId: item.id, dir: 'in', kind: item.kind, time: Date.now(), seen: mode === 'full' && alive() && win.isFocused() };
      if (item.from_user && item.from_user !== config.me?.id) entry.from = item.from_name;
      if (item.kind === 'text') {
        entry.text = item.text;
        entry.size = item.text.length;
        if (config.copyText) clipboard.writeText(item.text).catch(() => {});
      } else {
        const buf = Buffer.from(await (await api(`/api/items/${item.id}`)).arrayBuffer());
        fs.mkdirSync(INBOX, { recursive: true });
        entry.path = uniquePath(INBOX, safeName(item.name));
        await fsp.writeFile(entry.path, buf);
        Object.assign(entry, { name: path.basename(entry.path), mime: item.mime, size: buf.length });
      }
      history.unshift(entry);
      persist();
      await api(`/api/items/${item.id}/ack`, { method: 'POST' });
      notifyReceived(entry);
      send('ui', { type: 'received', id: entry.id });
    } catch (e) {
      console.error('receive failed', e);
    }
  }
  return true;
}

function notifyReceived(entry) {
  if (!config.notify || !Notification.isSupported()) return;
  const isImage = entry.mime?.startsWith('image/') && !/heic/.test(entry.mime);
  const n = new Notification({
    title: entry.kind === 'text'
      ? `Text from ${entry.from || 'your phone'}${config.copyText ? ', copied' : ''}`
      : `From ${entry.from || 'your phone'}`,
    body: entry.kind === 'text' ? entry.text.slice(0, 200) : entry.name,
    icon: isImage ? entry.path : path.join(ASSETS, 'app.png'),
    silent: false,
  });
  n.on('click', () => showPanel('full', { highlight: entry.id }));
  n.show();
}

const safeName = (n) => (n || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '_').slice(0, 180) || 'file';
function uniquePath(dir, name) {
  const ext = path.extname(name), stem = path.basename(name, ext);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

// ---------- item actions ----------
function copyFileToClipboard(file, isImage) {
  return new Promise((resolve) => {
    const script = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$d = New-Object System.Windows.Forms.DataObject
$c = New-Object System.Collections.Specialized.StringCollection
[void]$c.Add($env:BEAM_FILE)
$d.SetFileDropList($c)
if ($env:BEAM_IMAGE -eq '1') { try { $img = [System.Drawing.Image]::FromFile($env:BEAM_FILE); $d.SetImage((New-Object System.Drawing.Bitmap $img)); $img.Dispose() } catch {} }
[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      { windowsHide: true, env: { ...process.env, BEAM_FILE: file, BEAM_IMAGE: isImage ? '1' : '0' } }, (err) => resolve(!err));
  });
}

async function itemAction(id, act) {
  const entry = history.find((h) => h.id === id);
  if (!entry) return { ok: false };
  const exists = entry.path && fs.existsSync(entry.path);
  switch (act) {
    case 'open':
      if (entry.kind === 'text') {
        const t = entry.text.trim();
        if (/^https?:\/\/\S+$/.test(t)) shell.openExternal(t);
        else clipboard.writeText(entry.text).catch(() => {});
        return { ok: true, msg: /^https?:\/\//.test(t) ? null : 'Copied' };
      }
      if (!exists) return { ok: false, msg: 'File no longer exists' };
      shell.openPath(entry.path);
      return { ok: true };
    case 'copy':
      if (entry.kind === 'text') { await clipboard.writeText(entry.text); return { ok: true, msg: 'Copied' }; }
      if (!exists) return { ok: false, msg: 'File no longer exists' };
      return (await copyFileToClipboard(entry.path, entry.mime?.startsWith('image/'))) ? { ok: true, msg: 'Copied, paste anywhere' } : { ok: false, msg: 'Couldn\'t copy' };
    case 'save': {
      if (entry.kind === 'text' || !exists) return { ok: false, msg: 'Nothing to save' };
      const dest = uniquePath(app.getPath('downloads'), entry.name);
      await fsp.copyFile(entry.path, dest);
      entry.savedTo = dest;
      persist();
      return { ok: true, msg: 'Saved to Downloads' };
    }
    case 'reveal':
      if (entry.savedTo && fs.existsSync(entry.savedTo)) shell.showItemInFolder(entry.savedTo);
      else if (exists) shell.showItemInFolder(entry.path);
      return { ok: true };
    case 'retry':
      retry(entry);
      return { ok: true };
    case 'delete':
      history = history.filter((h) => h !== entry);
      if (entry.dir === 'in' && exists) fs.rm(entry.path, { force: true }, () => {});
      persist();
      return { ok: true };
  }
  return { ok: false };
}

// ---------- startup / install ----------
const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()], name: 'Beam' });

const SEND_TO = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo');
const launchArgs = (extra = '') => [app.isPackaged ? '' : `"${app.getAppPath()}"`, extra].filter(Boolean).join(' ');

function install({ startup = true } = {}) {
  if (SANDBOX) return;
  const icon = path.join(ASSETS, 'app.ico');
  shell.writeShortcutLink(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Beam.lnk'),
    { target: process.execPath, args: launchArgs(), icon, iconIndex: 0, appUserModelId: AUMID, description: 'Send files to your phone and friends' });
  fs.rm(path.join(SEND_TO(), 'iPhone (Beam).lnk'), { force: true }, () => {}); // name used before friends existed
  syncSendTo(true);
  app.setLoginItemSettings({ ...loginOpts(), openAtLogin: startup });
  // Copies from before the setup file existed lived in %LOCALAPPDATA%\Beam\app.
  const oldApp = path.join(ROOT, 'app');
  if (app.isPackaged && !process.execPath.startsWith(oldApp + path.sep)) fs.rm(oldApp, { recursive: true, force: true }, () => {});
}

// Right-click → Send to → "My phone (Beam)", "Diego's laptop (Beam)", ...
let sendToKey = '';
function syncSendTo(force = false) {
  if (SANDBOX) return;
  if (!force && !fs.existsSync(path.join(SEND_TO(), 'My phone (Beam).lnk'))) return; // not installed (e.g. running from source)
  const list = targets();
  const key = JSON.stringify(list.map((t) => [t.key, t.label]));
  if (key === sendToKey && !force) return;
  sendToKey = key;
  const want = new Map(list.map((t) => [`${safeName(t.label)} (Beam).lnk`, t]));
  try {
    for (const f of fs.readdirSync(SEND_TO())) if (f.endsWith(' (Beam).lnk') && !want.has(f)) fs.rmSync(path.join(SEND_TO(), f), { force: true });
  } catch {}
  for (const [file, t] of want) {
    shell.writeShortcutLink(path.join(SEND_TO(), file), {
      target: process.execPath, args: launchArgs(`--to=${t.key}`), icon: path.join(ASSETS, 'app.ico'), iconIndex: 0, description: `Send to ${t.label} with Beam`,
    });
  }
}

// Files passed on the command line (Explorer "Send to" or a second launch).
function pathsFromArgv(argv) {
  const self = path.resolve(app.getAppPath());
  return argv.slice(1).filter((a) => !a.startsWith('-') && path.resolve(a) !== self && fs.existsSync(a));
}

function handleArgv(argv) {
  if (!isSetUp()) return openSetup();
  const paths = pathsFromArgv(argv);
  const to = argv.find((a) => a.startsWith('--to='));
  if (paths.length) {
    if (mode === 'hidden') showPanel('compact', { focus: false });
    sendPaths(paths, targetFor(to ? to.slice(5) : config.target));
  } else {
    showPanel('full');
  }
}

// ---------- first-run setup ----------
let setupWin = null;
function openSetup() {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.show(); setupWin.focus(); return; }
  setupWin = new BrowserWindow({
    width: 560, height: 660, show: false, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, maximizable: false,
    fullscreenable: false, title: 'Set up Beam', icon: path.join(ASSETS, 'app.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  setupWin.webContents.on('will-navigate', (e) => e.preventDefault());
  setupWin.once('ready-to-show', () => setupWin.show());
  setupWin.on('closed', () => {
    setupWin = null;
    if (!isSetUp()) quit(); // closed before joining: nothing to keep running for
  });
  setupWin.loadFile(path.join(__dirname, 'ui', 'setup.html'));
}

// What someone pasted: an invite link, a bare invite code, a 6-digit pairing code from their other device, or the server's own key.
function parseInvite(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/(https?:\/\/[^\s/]+)\/join\?c=([A-Za-z0-9-]+)/);
  if (m) return { server: m[1], kind: 'invite', code: m[2].toUpperCase().replace(/[^A-Z0-9]/g, '') };
  const digits = raw.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(digits)) return { server: DEFAULT_SERVER, kind: 'pair', code: digits };
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 8) return { server: DEFAULT_SERVER, kind: 'invite', code };
  if (/^[0-9a-f]{32,}$/i.test(raw)) return { server: DEFAULT_SERVER, kind: 'key', code: raw };
  return null;
}

async function publicCall(server, p, body) {
  let res;
  try {
    res = await fetch(server + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  } catch {
    throw new Error('Can\'t reach Beam. Check your internet connection');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

const qrSvg = (text) => {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
};
async function pairCode() {
  const { code, expires } = await (await api('/api/pair/start', { method: 'POST' })).json();
  const url = `${config.server}/?pair=${code}`;
  return { code, expires, url, qr: qrSvg(url), host: new URL(config.server).host };
}

let quitting = false;
function quit() {
  quitting = true;
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
  app.quit();
}

// ---------- IPC ----------
ipcMain.handle('state', () => snapshot());
ipcMain.handle('send-paths', (_e, paths) => { sendPaths(paths); return true; });
ipcMain.handle('send-text', (_e, text) => { sendText(text); return true; });
ipcMain.handle('send-blob', (_e, { name, mime, data }) => { sendBuffer(safeName(name), mime, Buffer.from(data)); return true; });
ipcMain.handle('paste', () => paste());
ipcMain.handle('browse', async () => {
  const r = await dialog.showOpenDialog(alive() ? win : undefined, { title: 'Send to iPhone', properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) sendPaths(r.filePaths);
  return !r.canceled;
});
ipcMain.handle('item', (_e, { id, act }) => itemAction(id, act));
ipcMain.handle('set-mode', (_e, m) => {
  if (!alive()) return mode;
  if (m === 'compact' && mode === 'full') { mode = 'compact'; win.setBounds(boundsFor(COMPACT)); }
  else if (m === 'full' && mode === 'compact') { mode = 'full'; win.setBounds(boundsFor(FULL)); win.focus(); markSeen(); }
  return mode;
});
ipcMain.handle('hide', () => hidePanel());
ipcMain.handle('pair', () => pairCode());
ipcMain.handle('set-target', (_e, key) => { config.target = targetFor(key).key; saveConfig(); pushState(); return config.target; });
ipcMain.handle('invite', async () => {
  const inv = await (await api('/api/invites', { method: 'POST' })).json();
  await clipboard.writeText(inv.url).catch(() => {});
  return inv;
});
ipcMain.handle('rename', async (_e, name) => {
  config.me = await (await api('/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
  saveConfig();
  pushState();
  return config.me;
});
ipcMain.handle('copy-text', (_e, text) => clipboard.writeText(text));

// Setup window
ipcMain.handle('setup:info', async () => ({
  clipboard: String(await clipboard.readText().catch(() => '')).trim().slice(0, 300), hotkey: config.hotkey, setUp: isSetUp(), me: config.me || null,
}));
ipcMain.handle('setup:check', async (_e, input) => {
  const inv = parseInvite(input);
  if (!inv) throw new Error('That doesn\'t look like an invite. Paste the whole link');
  if (inv.kind !== 'invite') return { kind: inv.kind };
  const { from } = await publicCall(inv.server, `/api/invites/${inv.code}`);
  return { kind: 'invite', from };
});
ipcMain.handle('setup:join', async (_e, { input, name }) => {
  const inv = parseInvite(input);
  if (!inv) throw new Error('That doesn\'t look like an invite');
  const data = inv.kind === 'pair'
    ? await publicCall(inv.server, '/api/pair/claim', { code: inv.code })
    : await publicCall(inv.server, '/api/join', { code: inv.code, name });
  Object.assign(config, { server: inv.server.replace(/\/+$/, ''), token: data.token, me: data.user });
  saveConfig();
  dropSocket();
  install();
  updateTray();
  return data.user;
});
ipcMain.handle('setup:startup', (_e, on) => { if (!SANDBOX) app.setLoginItemSettings({ ...loginOpts(), openAtLogin: !!on }); });
ipcMain.handle('setup:status', async () => (await api('/api/status')).json());
ipcMain.handle('setup:finish', () => {
  if (setupWin && !setupWin.isDestroyed()) setupWin.close();
  showPanel('full');
});
ipcMain.handle('setup:close', () => { if (setupWin && !setupWin.isDestroyed()) setupWin.close(); });
ipcMain.handle('set-config', (_e, patch) => {
  if ('hotkey' in patch) {
    const prev = config.hotkey;
    if (!registerHotkey(patch.hotkey)) { registerHotkey(prev); pushState(); return { ok: false, msg: `${patch.hotkey} is taken by another app` }; }
    config.hotkey = patch.hotkey;
  }
  if ('copyText' in patch) config.copyText = !!patch.copyText;
  if ('notify' in patch) config.notify = !!patch.notify;
  if ('startup' in patch && !SANDBOX) app.setLoginItemSettings({ ...loginOpts(), openAtLogin: !!patch.startup });
  saveConfig();
  pushState();
  return { ok: true };
});
ipcMain.handle('open-inbox', () => { fs.mkdirSync(INBOX, { recursive: true }); shell.openPath(INBOX); });
ipcMain.handle('clear-history', () => {
  for (const h of history) if (h.dir === 'in' && h.path) fs.rm(h.path, { force: true }, () => {});
  history = history.filter((h) => h.status === 'sending');
  persist();
});
ipcMain.handle('quit', () => quit());

const dragIcon = () => nativeImage.createFromPath(path.join(ASSETS, 'drag.png'));
ipcMain.on('drag-out', (e, id) => {
  const entry = history.find((h) => h.id === id);
  if (!entry || !entry.path || !fs.existsSync(entry.path)) return;
  let icon = dragIcon();
  if (entry.mime?.startsWith('image/')) {
    const img = nativeImage.createFromPath(entry.path);
    if (!img.isEmpty()) icon = img.resize({ width: 72 });
  }
  e.sender.startDrag({ file: entry.path, icon });
});

// ---------- boot ----------
app.on('second-instance', (_e, argv) => handleArgv(argv));
app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(() => {
  if (!primary) return;
  fs.mkdirSync(INBOX, { recursive: true });
  loadConfig();
  loadHistory();
  if (process.argv.includes('--install') && isSetUp()) install();
  createTray();
  if (!SANDBOX) registerHotkey(config.hotkey);
  if (!hotkeyOk && !SANDBOX && Notification.isSupported()) {
    new Notification({ title: 'Beam hotkey unavailable', body: `${config.hotkey} is used by another app. Pick another one in Beam → Settings.` }).show();
  }
  connect();
  powerMonitor.on('resume', dropSocket);
  powerMonitor.on('unlock-screen', () => { if (!ws) dropSocket(); });
  if (!isSetUp()) openSetup();
  else if (pathsFromArgv(process.argv).length) handleArgv(process.argv);
  else if (process.argv.includes('--install') || process.argv.includes('--show')) showPanel('full');
});
