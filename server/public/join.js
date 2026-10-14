// The page an invite link opens: who invited you, the Windows download, and what setup will ask.
const DOWNLOAD = 'https://github.com/Victrozz/beam/releases/latest/download/Beam-Setup.exe';

const $ = (s) => document.querySelector(s);
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  download: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'),
  spark: P('<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>'),
  phone: P('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  copy: P('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
};
for (const n of document.querySelectorAll('[data-icon]')) n.insertAdjacentHTML('afterbegin', ICONS[n.dataset.icon] || '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const link = `${location.origin}/join?c=${code}`;
const copyLink = () => navigator.clipboard.writeText(link).then(() => true, () => false);
const isPhone = /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function fail(msg) {
  $('#error').textContent = msg;
  $('#error').hidden = false;
}

(async () => {
  if (!code) return fail('This link is missing its invite code. Ask for a new link.');
  const res = await fetch(`/api/invites/${code}`).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) return fail(data.error || 'Can\'t reach Beam right now. Try again in a minute.');
  document.title = `${data.from} invited you to Beam`;
  $('#title').textContent = `${data.from} invited you to Beam`;
  $('#code').textContent = `${code.slice(0, 4)}-${code.slice(4)}`;
  $('#download').href = DOWNLOAD;
  $('#steps').hidden = false;
  $('#mobileNote').hidden = !isPhone;
})();

$('#download').onclick = () => { copyLink(); };
$('#copy').onclick = async () => toast((await copyLink()) ? 'Invite link copied ✓' : 'Couldn\'t copy. Copy it from the address bar');
