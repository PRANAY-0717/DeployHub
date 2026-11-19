// State lives in memory and is mirrored to data/state.json so a restart does not lose history or
// webhook links. GitHub tokens are encrypted (AES-256-GCM, key derived from SESSION_SECRET).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STAGES = ['Cloning', 'Detecting', 'Generating', 'Building', 'Pushing', 'Deploying', 'Live'];
const MAX_LOG_LINES = 5000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'state.json');
const persist = process.env.PERSIST_STATE !== 'false';

const deployments = new Map(); // id -> deployment
const links = new Map();       // "owner/repo" -> config used by webhook redeploys
const key = (fullName) => fullName.toLowerCase();
const ts = () => new Date().toTimeString().slice(0, 8);

// ---- encryption helpers ----
const cryptoKey = () => crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-only-secret-change-me').digest();
function enc(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cryptoKey(), iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}
function dec(packed) {
  try {
    const [iv, tag, ct] = packed.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

// ---- persistence ----
let timer = null;
function writeNow() {
  if (!persist) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const state = {
      version: 1,
      deployments: [...deployments.values()],
      links: [...links.values()].map((l) => ({ ...l, token: l.token ? enc(l.token) : null })),
    };
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('Could not save state:', e.message); }
}
function scheduleSave() {
  if (!persist || timer) return;
  timer = setTimeout(() => { timer = null; writeNow(); }, 1000);
  if (timer.unref) timer.unref();
}
function flush() { if (timer) { clearTimeout(timer); timer = null; } writeNow(); }

function load() {
  if (!persist || !fs.existsSync(FILE)) return;
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const d of s.deployments || []) {
      if (d.status === 'running') { // the process died mid-run; it cannot still be running
        d.status = 'failed';
        d.failedIndex = Math.max(0, d.stageIndex);
        d.error = 'Server restarted while this deployment was running.';
        d.finishedAt = Date.now();
        d.logs.push(`${ts()}  ERROR: ${d.error}`);
      }
      deployments.set(d.id, d);
    }
    let dropped = 0;
    for (const l of s.links || []) {
      const token = l.token ? dec(l.token) : null;
      if (token) links.set(key(l.fullName), { ...l, token }); else dropped++;
    }
    if (dropped) console.warn(`${dropped} webhook link(s) dropped: SESSION_SECRET changed. Redeploy those repos once.`);
  } catch (e) { console.error('Could not load saved state:', e.message); }
}
load();

// ---- API ----
function create({ fullName, branch, ownerLogin, trigger = 'manual', port = null, replicas = 2 }) {
  const id = crypto.randomBytes(5).toString('hex');
  const dep = {
    id, fullName, repo: fullName.split('/')[1], branch, ownerLogin, trigger,
    requestedPort: port, port, replicas,
    status: 'running',          // running | live | failed
    stage: 'Queued', stageIndex: -1, failedIndex: null, error: null,
    commit: null, stack: null, image: null, url: null, appName: null, namespace: null,
    logs: [], startedAt: Date.now(), finishedAt: null,
  };
  deployments.set(id, dep);
  scheduleSave();
  return dep;
}

function log(dep, line) {
  if (dep.logs.length >= MAX_LOG_LINES) return;
  dep.logs.push(`${ts()}  ${line}`);
  if (dep.logs.length === MAX_LOG_LINES) dep.logs.push(`${ts()}  ... log truncated`);
  scheduleSave();
}

const get = (id) => deployments.get(id);

function listByOwner(login) {
  return [...deployments.values()].filter((d) => d.ownerLogin === login).sort((a, b) => b.startedAt - a.startedAt);
}
function latestFor(login, fullName) {
  return listByOwner(login).find((d) => key(d.fullName) === key(fullName));
}
function isRunning(fullName) {
  return [...deployments.values()].some((d) => d.status === 'running' && key(d.fullName) === key(fullName));
}
function removeApp(login, fullName) {
  for (const [id, d] of deployments) {
    if (d.ownerLogin === login && key(d.fullName) === key(fullName)) deployments.delete(id);
  }
  scheduleSave();
}
const publicView = ({ logs, ...rest }) => rest; // listings never include the log lines

const setLink = (fullName, v) => { links.set(key(fullName), { ...(links.get(key(fullName)) || {}), fullName, ...v }); scheduleSave(); };
const getLink = (fullName) => links.get(key(fullName));
const deleteLink = (fullName) => { links.delete(key(fullName)); scheduleSave(); };

module.exports = {
  STAGES, create, log, get, listByOwner, latestFor, isRunning, removeApp, publicView,
  setLink, getLink, deleteLink, touch: scheduleSave, flush,
};
