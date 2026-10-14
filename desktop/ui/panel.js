const $ = (s) => document.querySelector(s);
const card = $('#card');
const drop = $('#drop');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  arrowUp: P('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
  arrowDown: P('<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>'),
  check: P('<path d="M20 6 9 17l-5-5"/>'),
  alert: P('<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9.5"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  x: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  back: P('<path d="m15 18-6-6 6-6"/>'),
  copy: P('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  download: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'),
  folder: P('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  trash: P('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  retry: P('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  external: P('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>'),
  text: P('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  globe: P('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>'),
  inbox: P('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.6 5h12.8L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>'),
  phone: P('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  laptop: P('<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
};
const paintIcons = (root = document) => {
  for (const n of root.querySelectorAll('[data-icon]')) if (!n.querySelector('svg') && ICONS[n.dataset.icon]) n.insertAdjacentHTML('afterbegin', ICONS[n.dataset.icon]);
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
const fmtSize = (n) => !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const ago = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const isUrl = (t) => /^https?:\/\/\S+$/.test((t || '').trim());

let S = null;
let filter = 'all';
let lastListKey = '';
let dialogOpen = false;
let recording = false;
let internalDrag = false;
let autoHideTimer = null;
let dropResetTimer = null;
let batch = null;
let hovered = false;

const target = () => S?.targets.find((t) => t.key === S.target) || { short: 'your phone', label: 'My phone' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---------- drop zone ----------
function idleText() {
  const compact = card.classList.contains('compact');
  $('#dropTitle').textContent = 'Drop to send';
  const to = esc(target().short);
  $('#dropSub').innerHTML = compact ? `to ${to}` : `to ${to} · <kbd>Ctrl</kbd><kbd>V</kbd> to paste · click to browse`;
}
function setDrop(state, title, sub) {
  drop.dataset.state = state;
  if (state === 'idle') return idleText();
  if (title !== undefined) $('#dropTitle').textContent = title;
  if (sub !== undefined) $('#dropSub').textContent = sub;
}

function updateDropFromState() {
  const sendingNow = S.history.filter((h) => h.status === 'sending');
  if (sendingNow.length) {
    clearTimeout(dropResetTimer);
    batch ??= new Set();
    for (const h of sendingNow) batch.add(h.id);
    const total = batch.size;
    const label = sendingNow[sendingNow.length - 1];
    setDrop('busy', total > 1 ? `Sending ${total - sendingNow.length + 1} of ${total}…` : 'Sending…', label.kind === 'text' ? 'Text' : label.name);
    clearAutoHide();
    return;
  }
  if (!batch) return;
  const entries = S.history.filter((h) => batch.has(h.id));
  batch = null;
  const failed = entries.filter((e) => e.status === 'failed');
  if (failed.length) setDrop('error', failed.length > 1 ? `${failed.length} couldn't be sent` : 'Couldn\'t send', failed[0].error || 'Try again');
  else {
    const toLabel = entries.find((e) => e.toLabel)?.toLabel;
    const warn = entries.find((e) => e.warn)?.warn;
    setDrop('done', entries.length > 1 ? `${entries.length} sent` : 'Sent', warn || (toLabel ? `On its way to ${toLabel}` : 'Check your phone'));
  }
  dropResetTimer = setTimeout(() => setDrop('idle'), failed.length ? 4500 : 2200);
  if (card.classList.contains('compact') && !failed.length) armAutoHide(1500);
}

// ---------- compact / full ----------
async function collapse() {
  if (card.classList.contains('compact') || !card.classList.contains('shown')) return;
  closeSheet();
  card.classList.add('compact');
  if (drop.dataset.state === 'idle') idleText();
  await wait(340);
  if (card.classList.contains('compact')) await beam.setMode('compact');
  if (drop.dataset.state !== 'busy') armAutoHide(5000);
}
async function expand() {
  clearAutoHide();
  if (!card.classList.contains('compact')) return;
  await beam.setMode('full');
  card.classList.remove('compact');
  if (drop.dataset.state === 'idle') idleText();
}
function armAutoHide(ms) {
  clearAutoHide();
  autoHideTimer = setTimeout(() => {
    if (hovered || drop.dataset.state === 'busy' || drop.dataset.state === 'over') return armAutoHide(1500);
    beam.hide();
  }, ms);
}
function clearAutoHide() { clearTimeout(autoHideTimer); autoHideTimer = null; }

card.addEventListener('mouseenter', () => { hovered = true; });
card.addEventListener('mouseleave', () => { hovered = false; if (card.classList.contains('compact') && autoHideTimer) armAutoHide(3000); });

// ---------- events from main ----------
beam.onUi((m) => {
  if (m.type === 'open') {
    card.classList.remove('leaving', 'shown');
    card.classList.toggle('compact', m.mode === 'compact');
    closeSheet();
    clearAutoHide();
    if (drop.dataset.state !== 'busy') setDrop('idle');
    void card.offsetWidth;
    requestAnimationFrame(() => card.classList.add('shown'));
    if (m.highlight) highlight(m.highlight);
  } else if (m.type === 'expand') {
    if (m.mode === 'full') { clearAutoHide(); card.classList.remove('compact'); if (drop.dataset.state === 'idle') idleText(); }
    if (m.highlight) highlight(m.highlight);
  } else if (m.type === 'close') {
    clearAutoHide();
    card.classList.add('leaving');
    card.classList.remove('shown');
  } else if (m.type === 'blur') {
    if (!dialogOpen && !recording) collapse();
  } else if (m.type === 'received') {
    setTimeout(() => highlight(m.id, false), 50);
  }
});

function highlight(id, scroll = true) {
  if (filter === 'out') setFilter('all');
  const row = document.querySelector(`.row[data-id="${id}"]`);
  if (!row) return;
  if (scroll) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

// ---------- state rendering ----------
beam.onState((s) => { S = s; render(); });
beam.state().then((s) => { S = s; render(); });

function render() {
  if (!S) return;
  const conn = $('#conn');
  const c = S.status.conn;
  conn.className = 'conn ' + c;
  conn.lastElementChild.textContent = { online: 'Connected', polling: 'Connected (slow)', connecting: 'Connecting…', offline: 'Offline' }[c] || c;
  conn.title = c === 'polling' ? 'This network blocks live connections; checking every 20 s instead' : '';
  renderTargets();
  renderList();
  renderSettings();
  updateDropFromState();
  if (drop.dataset.state === 'idle') idleText();
}

// ---------- who gets it ----------
let lastTargetsKey = '';
function renderTargets() {
  const key = JSON.stringify([S.target, S.targets]);
  if (key === lastTargetsKey) return;
  lastTargetsKey = key;
  const box = $('#targets');
  box.innerHTML = S.targets.map((t) => `<button class="chip${t.key === S.target ? ' on' : ''}" data-key="${esc(t.key)}"
    title="${esc(t.to === 'phone' ? (t.online ? 'Notifications on' : 'Notifications off') : (t.online ? 'Online' : 'Offline, gets it when back'))}">
    <span data-icon="${t.to}"></span>${esc(t.label)}<i class="${t.online ? 'on' : ''}"></i></button>`).join('')
    + (S.targets.length < 2 ? '<button class="chip add" id="inviteChip"><span data-icon="plus"></span>Invite a friend</button>' : '');
  paintIcons(box);
}
$('#targets').addEventListener('click', async (e) => {
  if (e.target.closest('#inviteChip')) return makeInvite(true);
  const chip = e.target.closest('[data-key]');
  if (chip) await beam.setTarget(chip.dataset.key);
});
// A mouse wheel scrolls the chips sideways.
$('#targets').addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }, { passive: false });

function renderList() {
  const items = S.history.filter((h) => filter === 'all' || h.dir === filter);
  const key = filter + JSON.stringify(items.map((h) => [h.id, h.status, h.seen, h.savedTo, h.warn, ago(h.time)]));
  if (key === lastListKey) return;
  lastListKey = key;
  const list = $('#list');
  if (!items.length) {
    list.innerHTML = `<div class="empty"><div class="e-ico" data-icon="inbox"></div><b>${filter === 'out' ? 'Nothing sent yet' : 'Nothing here yet'}</b>
      ${filter === 'in' ? 'Things from your phone and friends land here.' : 'Drop something above, or send from your phone.'}</div>`;
  } else {
    list.innerHTML = items.map(rowHtml).join('');
  }
  paintIcons(list);
}

function rowHtml(h) {
  const isImg = h.kind === 'file' && h.path && /^image\/(png|jpe?g|gif|webp|bmp|svg)/.test(h.mime || '');
  const ext = (h.name?.includes('.') ? h.name.split('.').pop() : 'file').slice(0, 4);
  const thumb = isImg ? `<img src="${fileUrl(h.path)}" alt="" loading="lazy">`
    : h.kind === 'text' ? `<span class="txt" data-icon="${isUrl(h.text) ? 'globe' : 'text'}"></span>`
      : `<span class="ext">${esc(ext)}</span>`;
  const name = h.kind === 'text' ? h.text.trim().split('\n')[0].slice(0, 120) : h.name;

  let sub;
  if (h.status === 'sending') sub = '<span class="sending">Sending…</span>';
  else if (h.status === 'failed') sub = `<span class="err" title="${esc(h.error)}">Failed · ${esc(h.error || 'try again')}</span>`;
  else {
    const dir = h.dir === 'in' ? `<span class="dir in" data-icon="arrowDown">${esc(h.from || 'Phone')}</span>`
      : `<span class="dir" data-icon="arrowUp">${esc(h.toLabel || 'Sent')}</span>`;
    const extra = h.warn ? '<span class="warn" title="' + esc(h.warn) + '">· ' + (/offline/.test(h.warn) ? 'waiting' : 'not notified') + '</span>'
      : h.savedTo ? '<span class="saved">· in Downloads</span>' : `<span>· ${fmtSize(h.size)}</span>`;
    sub = `${dir}<span>· ${ago(h.time)}</span>${h.kind === 'text' ? '' : extra}`;
  }

  const a = (act, icon, title, cls = '') => `<button class="act ${cls}" data-act="${act}" data-icon="${icon}" title="${title}"></button>`;
  let acts = '';
  if (h.status === 'failed') acts = a('retry', 'retry', 'Try again', 'primary') + a('delete', 'trash', 'Remove', 'danger');
  else if (h.kind === 'text') acts = a('copy', 'copy', 'Copy') + (isUrl(h.text) ? a('open', 'external', 'Open link') : '') + a('delete', 'trash', 'Remove', 'danger');
  else if (h.dir === 'in') acts = a('copy', 'copy', 'Copy (paste anywhere)') + a('save', 'download', 'Save to Downloads') + a('reveal', 'folder', 'Show in folder') + a('delete', 'trash', 'Delete', 'danger');
  else acts = (h.path ? a('reveal', 'folder', 'Show in folder') : '') + a('delete', 'trash', 'Remove', 'danger');

  const draggable = h.kind === 'file' && h.path && h.status !== 'sending';
  const tip = h.kind === 'text' ? 'Double-click to copy' : 'Double-click to open · drag it anywhere';
  return `<div class="row${h.dir === 'in' && !h.seen ? ' unread' : ''}" data-id="${h.id}" ${draggable ? 'draggable="true"' : ''} title="${tip}">
    <div class="thumb">${thumb}</div>
    <div class="info"><div class="name">${esc(name)}</div><div class="sub">${sub}</div></div>
    <div class="acts">${acts}</div></div>`;
}

function setFilter(f) {
  filter = f;
  for (const b of document.querySelectorAll('#filter button')) b.classList.toggle('on', b.dataset.filter === f);
  lastListKey = '';
  renderList();
}
for (const b of document.querySelectorAll('#filter button')) b.onclick = () => setFilter(b.dataset.filter);
setInterval(() => S && renderList(), 30000);

const list = $('#list');
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.row').dataset.id;
  const res = await beam.item(id, btn.dataset.act);
  if (res?.msg) toast(res.msg);
});
list.addEventListener('dblclick', async (e) => {
  const row = e.target.closest('.row');
  if (!row || e.target.closest('[data-act]')) return;
  const res = await beam.item(row.dataset.id, 'open');
  if (res?.msg) toast(res.msg);
});
list.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.row[draggable="true"]');
  if (!row) return;
  e.preventDefault();
  internalDrag = true;
  beam.dragOut(row.dataset.id);
});
document.addEventListener('mousemove', (e) => { if (!e.buttons) internalDrag = false; });

// ---------- dropping things in ----------
let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (internalDrag) return;
  dragDepth++;
  clearAutoHide();
  if (drop.dataset.state !== 'busy') { clearTimeout(dropResetTimer); setDrop('over', 'Release to send', `to ${target().short}`); }
});
document.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = internalDrag ? 'none' : 'copy'; });
document.addEventListener('dragleave', (e) => {
  if (internalDrag) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    if (drop.dataset.state === 'over') setDrop('idle');
    if (card.classList.contains('compact')) armAutoHide(3000);
  }
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  if (internalDrag) { internalDrag = false; return; }
  if (drop.dataset.state === 'over') setDrop('idle');
  const dt = e.dataTransfer;
  const paths = [];
  for (const f of dt.files) {
    const p = beam.pathFor(f);
    if (p) paths.push(p);
    else beam.sendBlob(f.name || 'file', f.type || 'application/octet-stream', await f.arrayBuffer()); // e.g. an image dragged from a browser
  }
  if (paths.length) return beam.sendPaths(paths);
  if (!dt.files.length) {
    const text = dt.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#')) || dt.getData('text/plain');
    if (text) beam.sendText(text);
  }
});

drop.addEventListener('click', async () => {
  if (card.classList.contains('compact')) return expand();
  if (drop.dataset.state === 'busy') return;
  dialogOpen = true;
  try { await beam.browse(); } finally { dialogOpen = false; }
});

// ---------- keyboard ----------
window.addEventListener('keydown', async (e) => {
  if (recording) return recordKey(e);
  if (e.target.closest?.('input')) return; // typing your name: Ctrl+V pastes text, Esc is the field's
  if (e.key === 'Escape') { if ($('#sheet').classList.contains('open')) closeSheet(); else beam.hide(); return; }
  if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    const r = await beam.paste();
    if (r === 'empty') toast('Clipboard is empty');
  }
}, true);

// ---------- header & settings ----------
$('#closeBtn').onclick = () => beam.hide();
$('#settingsBtn').onclick = () => { $('#sheet').classList.add('open'); $('#sheet').setAttribute('aria-hidden', 'false'); };
$('#backBtn').onclick = closeSheet;
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheet').setAttribute('aria-hidden', 'true');
  stopRecording();
}

function renderSettings() {
  const st = S.settings;
  if (!recording) {
    $('#hotkeyBtn').innerHTML = st.hotkey.split('+').map((k) => `<kbd>${esc(k.trim())}</kbd>`).join('');
    $('#hotkeyHint').textContent = st.hotkeyOk ? 'Click to change' : 'Taken by another app. Click to pick another';
    $('#hotkeyHint').style.color = st.hotkeyOk ? '' : 'var(--danger)';
  }
  for (const t of document.querySelectorAll('.toggle')) t.checked = !!st[t.dataset.key];
  const subs = S.status.phoneSubs;
  $('#subsText').textContent = subs == null ? 'Checking…' : subs > 0 ? `On · ${subs} device${subs > 1 ? 's' : ''}` : 'Off. Open Beam on your phone and turn them on';
  $('#subsDot').className = 'dot-status ' + (subs == null ? '' : subs > 0 ? 'on' : 'off');
  try { $('#serverText').textContent = new URL(st.server).host; } catch { $('#serverText').textContent = 'Not set up'; }
  const nameInput = $('#nameInput');
  if (document.activeElement !== nameInput) nameInput.value = S.me?.name || '';
  $('#friendRows').innerHTML = S.status.friends.map((f) => `<div class="srow">
    <div class="srow-text"><div class="t">${esc(f.name)}</div></div>
    <div class="friend-st"><span title="${f.laptop ? 'Laptop online' : 'Laptop offline'}" data-icon="laptop"><i class="${f.laptop ? 'on' : ''}"></i></span>
    <span title="${f.phone ? 'Phone notifications on' : 'Phone notifications off'}" data-icon="phone"><i class="${f.phone ? 'on' : ''}"></i></span></div></div>`).join('');
  paintIcons($('#friendRows'));
}

const cleanError = (e) => String(e.message || e).replace(/^Error invoking remote method '[\w:-]+': (Error: )?/, '');

async function makeInvite(fromChip) {
  try {
    const inv = await beam.invite();
    $('#inviteUrl').textContent = inv.url;
    $('#inviteBox').hidden = false;
    toast('Invite link copied. Send it to your friend');
    if (fromChip) { $('#sheet').classList.add('open'); $('#sheet').setAttribute('aria-hidden', 'false'); }
  } catch (e) {
    toast(cleanError(e));
  }
}
$('#inviteBtn').onclick = () => makeInvite(false);
$('#inviteUrl').onclick = () => { beam.copyText($('#inviteUrl').textContent); toast('Copied'); };

$('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); e.target.value = S.me?.name || ''; e.target.blur(); } });
$('#nameInput').addEventListener('change', async (e) => {
  const name = e.target.value.trim();
  if (!name || name === S.me?.name) { e.target.value = S.me?.name || ''; return; }
  try { await beam.rename(name); toast('Name saved'); } catch (err) { toast(cleanError(err)); e.target.value = S.me?.name || ''; }
});

for (const t of document.querySelectorAll('.toggle')) {
  t.addEventListener('change', async () => {
    const r = await beam.setConfig({ [t.dataset.key]: t.checked });
    if (!r.ok) toast(r.msg);
  });
}

let codeTimer = null;
$('#pairBtn').onclick = async () => {
  try {
    const { code, qr, expires } = await beam.pair();
    $('#codeDigits').textContent = `${code.slice(0, 3)} ${code.slice(3)}`;
    $('#codeQr').innerHTML = qr;
    $('#codeBox').hidden = false;
    const until = expires;
    clearInterval(codeTimer);
    const tick = () => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      $('#codeTimer').textContent = left ? `in Beam on the phone · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired';
      if (!left) { clearInterval(codeTimer); setTimeout(() => { $('#codeBox').hidden = true; }, 1500); }
    };
    tick();
    codeTimer = setInterval(tick, 1000);
  } catch (e) {
    toast(cleanError(e));
  }
};

$('#hotkeyBtn').onclick = () => {
  recording = true;
  $('#hotkeyBtn').classList.add('recording');
  $('#hotkeyBtn').innerHTML = '<kbd>Press a shortcut…</kbd>';
  $('#hotkeyHint').textContent = 'Esc to cancel';
  $('#hotkeyHint').style.color = '';
};
function stopRecording() {
  if (!recording) return;
  recording = false;
  $('#hotkeyBtn').classList.remove('recording');
  if (S) renderSettings();
}
async function recordKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') return stopRecording();
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean);
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (e.code === 'Space') key = 'Space';
  if (!key) { $('#hotkeyBtn').innerHTML = mods.map((m) => `<kbd>${m}</kbd>`).join('') + '<kbd>…</kbd>'; return; }
  if (!mods.length && !/^F\d/.test(key)) { $('#hotkeyHint').textContent = 'Add Ctrl, Alt or Win'; return; }
  const combo = [...mods, key].join('+');
  recording = false;
  $('#hotkeyBtn').classList.remove('recording');
  const r = await beam.setConfig({ hotkey: combo });
  toast(r.ok ? `Shortcut set to ${combo}` : r.msg);
  renderSettings();
}

$('#openInboxBtn').onclick = () => beam.openInbox();
$('#clearBtn').onclick = async () => {
  const b = $('#clearBtn');
  if (b.dataset.confirm) { delete b.dataset.confirm; b.textContent = 'Clear'; await beam.clearHistory(); toast('History cleared'); return; }
  b.dataset.confirm = '1';
  b.textContent = 'Sure?';
  setTimeout(() => { delete b.dataset.confirm; b.textContent = 'Clear'; }, 3000);
};
$('#quitBtn').onclick = () => beam.quit();

paintIcons();
idleText();
