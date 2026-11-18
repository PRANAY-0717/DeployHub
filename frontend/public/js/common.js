// Shared client helpers (loaded on every authenticated page).
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function api(url, opts) {
  const o = Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {});
  const r = await fetch(url, o);
  let data = {};
  try { data = await r.json(); } catch (e) { /* non-JSON response */ }
  if (r.status === 401) { location.href = '/'; throw new Error('Session expired'); }
  if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
  return data;
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const units = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]];
  for (const [u, n] of units) if (s >= n) return Math.floor(s / n) + u + ' ago';
  return 'just now';
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

function statusPill(dep) {
  const label = dep.status === 'live' ? 'Live' : dep.status === 'failed' ? 'Failed' : dep.stage;
  return '<span class="pill pill-' + esc(dep.status) + '">' + esc(label) + '</span>';
}
