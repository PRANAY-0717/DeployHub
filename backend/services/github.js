// Thin wrapper around Octokit. The user's token is passed per call, never stored here.
const { Octokit } = require('@octokit/rest');

const client = (token) => new Octokit({ auth: token, userAgent: 'deploysync' });

async function listRepos(token) {
  const { data } = await client(token).rest.repos.listForAuthenticatedUser({
    per_page: 100, sort: 'pushed', direction: 'desc',
  });
  return data.map((r) => ({
    id: r.id, name: r.name, fullName: r.full_name, description: r.description,
    language: r.language, private: r.private, pushedAt: r.pushed_at,
    defaultBranch: r.default_branch, htmlUrl: r.html_url, archived: r.archived,
  }));
}

// Also serves as the access check: GitHub 404s if the token's user cannot see the repo.
async function getRepo(token, owner, repo) {
  const { data } = await client(token).rest.repos.get({ owner, repo });
  return data;
}

module.exports = { client, listRepos, getRepo };

// ---- Phase 4: helpers for the deploy dialog ----
const { guess } = require('./detector');

async function listBranches(token, owner, repo) {
  const o = client(token);
  return o.paginate(o.rest.repos.listBranches, { owner, repo, per_page: 100 }, (r) => r.data.map((b) => b.name));
}

// Looks at the repo root through the API (no clone) to prefill stack + port in the dialog.
async function quickDetect(token, owner, repo, ref) {
  const o = client(token);
  const { data } = await o.rest.repos.getContent({ owner, repo, path: '', ref });
  const names = Array.isArray(data) ? data.map((f) => f.name) : [];
  let text = '';
  if (names.includes('Dockerfile')) {
    try {
      const f = await o.rest.repos.getContent({ owner, repo, path: 'Dockerfile', ref });
      text = Buffer.from(f.data.content, 'base64').toString('utf8');
    } catch (e) { /* ignore: port just stays unknown */ }
  }
  return guess(names, text);
}
Object.assign(module.exports, { listBranches, quickDetect });

// ---- Phase 5: webhook (auto-redeploy on push) ----
const crypto = require('crypto');

// Constant-time HMAC check over the RAW request body (parsed JSON would change the bytes).
function verifySignature(rawBody, header, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !header.startsWith('sha256=') || !secret) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

async function ensureWebhook(token, fullName) {
  const base = process.env.BASE_URL || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base)) {
    return { skipped: true, reason: 'BASE_URL is localhost. Run ngrok and set BASE_URL to the public https URL to enable auto-redeploy on push.' };
  }
  if (!process.env.WEBHOOK_SECRET) return { skipped: true, reason: 'WEBHOOK_SECRET is not set.' };
  const [owner, repo] = fullName.split('/');
  try {
    const { data } = await client(token).rest.repos.createWebhook({
      owner, repo, events: ['push'], active: true,
      config: { url: `${base}/webhook/github`, content_type: 'json', secret: process.env.WEBHOOK_SECRET, insecure_ssl: '0' },
    });
    return { created: true, id: data.id };
  } catch (e) {
    if (e.status === 422) return { existing: true }; // hook with this URL already registered
    throw e;
  }
}
Object.assign(module.exports, { verifySignature, ensureWebhook });
