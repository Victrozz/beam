// First-run setup: invite → name → how it works → phone → done.
const $ = (s) => document.querySelector(s);
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  arrowUp: P('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
  check: P('<path d="M20 6 9 17l-5-5"/>'),
  x: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  laptop: P('<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>'),
  phone: P('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  users: P('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 13.6a6.5 6.5 0 0 1 3.5 6.4"/>'),
  lock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  link: P('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  alert: P('<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9.5"/>'),
};
for (const n of document.querySelectorAll('[data-icon]')) n.insertAdjacentHTML('afterbegin', ICONS[n.dataset.icon] || '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanError = (e) => String(e.message || e).replace(/^Error invoking remote method '[\w:-]+': (Error: )?/, '');

const ORDER = ['welcome', 'invite', 'name', 'tour', 'phone', 'done'];
const DOT_FOR = { welcome: 0, invite: 1, name: 1, tour: 2, phone: 3, done: 4 };
let step = 'welcome';
let invite = null; // { input, kind, from }
let me = null;
const trail = [];

function go(next, back = false) {
  if (!back) trail.push(step);
  const cur = document.querySelector(`[data-step="${step}"]`);
  const nxt = document.querySelector(`[data-step="${next}"]`);
  cur.hidden = true;
  nxt.hidden = false;
  nxt.classList.remove('in', 'back');
  void nxt.offsetWidth;
  nxt.classList.add('in', back ? 'back' : 'fwd');
  step = next;
  [...$('#dots').children].forEach((d, i) => { d.className = i < DOT_FOR[next] ? 'done' : i === DOT_FOR[next] ? 'on' : ''; });
  onEnter[next]?.();
}
const back = () => trail.length && go(trail.pop(), true);
const nextAfter = (s) => ORDER[ORDER.indexOf(s) + 1];

for (const b of document.querySelectorAll('[data-next]')) b.onclick = () => go(nextAfter(step));
for (const b of document.querySelectorAll('[data-back]')) b.onclick = back;
$('#closeBtn').onclick = () => beam.setup.close();
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.target.closest('button')) {
    const primary = document.querySelector(`[data-step="${step}"] .btn.primary:not([hidden])`);
    if (primary && !primary.disabled) primary.click();
  }
});

const onEnter = {};
let info = {};
beam.setup.info().then((i) => {
  info = i;
  $('#hotkey').innerHTML = (i.hotkey || 'Ctrl+Alt+B').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('');
});

// ---------- invite ----------
function setCheck(el, kind, html) {
  el.className = 'check ' + kind;
  el.innerHTML = kind === 'ok' ? ICONS.check + `<span>${html}</span>` : kind === 'bad' ? ICONS.alert + `<span>${html}</span>` : kind === 'busy' ? `<span class="spin"></span><span>${html}</span>` : '';
}

let checkSeq = 0;
let checkTimer = null;
async function checkInvite() {
  const input = $('#inviteInput').value.trim();
  const seq = ++checkSeq;
  invite = null;
  $('#inviteNext').disabled = true;
  if (!input) return setCheck($('#inviteCheck'), '', '');
  setCheck($('#inviteCheck'), 'busy', 'Checking…');
  try {
    const r = await beam.setup.check(input);
    if (seq !== checkSeq) return;
    invite = { input, ...r };
    setCheck($('#inviteCheck'), 'ok', r.kind === 'invite' ? `Invited by <b>${esc(r.from)}</b>`
      : r.kind === 'pair' ? 'Pairing code. This laptop joins your Beam account' : 'Server key. This laptop signs in as the owner');
    $('#inviteNext').disabled = false;
  } catch (e) {
    if (seq === checkSeq) setCheck($('#inviteCheck'), 'bad', esc(cleanError(e)));
  }
}
$('#inviteInput').addEventListener('input', () => { clearTimeout(checkTimer); checkTimer = setTimeout(checkInvite, 350); });

onEnter.invite = () => {
  const field = $('#inviteInput');
  // The join page copies the link when you click Download, so it's usually on the clipboard already.
  if (!field.value && /\/join\?c=[A-Za-z0-9-]{6,}/.test(info.clipboard || '')) {
    field.value = info.clipboard.match(/\S*\/join\?c=[A-Za-z0-9-]+/)[0];
    checkInvite();
  }
  setTimeout(() => field.focus(), 250);
};

$('#inviteNext').onclick = async () => {
  if (!invite) return;
  if (invite.kind === 'invite') return go('name');
  // Pairing codes and the server key sign in to an existing account: no name to ask for.
  $('#inviteNext').disabled = true;
  setCheck($('#inviteCheck'), 'busy', 'Signing in…');
  try {
    me = await beam.setup.join(invite.input, '');
    go('tour');
  } catch (e) {
    setCheck($('#inviteCheck'), 'bad', esc(cleanError(e)));
    $('#inviteNext').disabled = false;
  }
};

// ---------- name ----------
onEnter.name = () => setTimeout(() => $('#nameInput').focus(), 250);
$('#nameInput').addEventListener('input', () => {
  const v = $('#nameInput').value.trim();
  $('#nameEcho').textContent = v || 'Diego';
  $('#nameNext').disabled = !v;
});
$('#nameNext').onclick = async () => {
  const name = $('#nameInput').value.trim();
  if (!name) return;
  $('#nameNext').disabled = true;
  setCheck($('#nameCheck'), 'busy', 'Setting you up…');
  try {
    me = await beam.setup.join(invite.input, name);
    setCheck($('#nameCheck'), '', '');
    trail.length = 0; // the account exists now; going back to the invite makes no sense
    go('tour');
  } catch (e) {
    setCheck($('#nameCheck'), 'bad', esc(cleanError(e)));
    $('#nameNext').disabled = false;
  }
};

// ---------- tour ----------
onEnter.tour = () => { trail.length = 0; };
$('#startup').onchange = (e) => beam.setup.startup(e.target.checked);

// ---------- phone ----------
let pollTimer = null;
let codeTimer = null;
let baseline = null;
async function newCode() {
  try {
    const p = await beam.pair();
    $('#qr').innerHTML = p.qr;
    $('#qrHost').textContent = p.host;
    $('#code').textContent = `${p.code.slice(0, 3)} ${p.code.slice(3)}`;
    clearTimeout(codeTimer);
    codeTimer = setTimeout(newCode, Math.max(30000, p.expires - Date.now() - 15000));
  } catch (e) {
    $('#phoneStatus').className = 'status bad';
    $('#phoneStatus').textContent = cleanError(e);
  }
}
async function poll() {
  try {
    const s = await beam.setup.status();
    baseline ??= s.devices;
    const paired = s.devices > baseline;
    const st = $('#phoneStatus');
    if (s.subs > 0 && paired) {
      st.className = 'status ok';
      st.innerHTML = ICONS.check + 'Phone connected, notifications on';
      $('#phoneNext').hidden = false;
      $('#skipPhone').hidden = true;
      return;
    }
    if (paired) {
      st.className = 'status ok';
      st.innerHTML = ICONS.check + 'Phone connected. Now turn on notifications in its Settings tab';
      $('#phoneNext').hidden = false;
      $('#skipPhone').hidden = true;
    }
  } catch {}
  pollTimer = setTimeout(poll, 2500);
}
onEnter.phone = () => {
  trail.length = 0;
  newCode();
  clearTimeout(pollTimer);
  poll();
};
const leavePhone = () => { clearTimeout(pollTimer); clearTimeout(codeTimer); go('done'); };
$('#skipPhone').onclick = leavePhone;
$('#phoneNext').onclick = leavePhone;

// ---------- done ----------
onEnter.done = () => {
  trail.length = 0;
  $('#doneTitle').textContent = me?.name ? `You're all set, ${me.name}` : 'You\'re all set';
  $('#doneLead').innerHTML = `Press ${(info.hotkey || 'Ctrl+Alt+B').split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('')} any time, or click Beam by the clock.`;
};
$('#finish').onclick = () => beam.setup.finish();
