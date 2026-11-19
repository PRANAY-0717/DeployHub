// Deployment API + pages. The pipeline runs in the background; the UI polls for status and logs.
const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const store = require('../services/store');
const gh = require('../services/github');
const { run } = require('../services/shell');
const { runPipeline } = require('../services/pipeline');

const router = express.Router();
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const BRANCH_RE = /^[\w./-]+$/;

const limiter = rateLimit({
  windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.sessionID,
  message: { error: 'Too many deployments. Wait a minute and try again.' },
});

const owned = (req, res) => {
  const dep = store.get(req.params.id);
  if (!dep || dep.ownerLogin !== req.session.user.login) { res.status(404).json({ error: 'Deployment not found' }); return null; }
  return dep;
};

function start(req, { fullName, branch, port, replicas, trigger }) {
  const dep = store.create({ fullName, branch, ownerLogin: req.session.user.login, trigger, port, replicas });
  store.setLink(fullName, { ownerLogin: dep.ownerLogin, token: req.session.token, branch, port, replicas });
  runPipeline(dep, req.session.token); // intentionally not awaited; never throws
  return dep;
}

router.post('/api/deploy', requireAuth, limiter, async (req, res) => {
  const { fullName, branch, port, replicas } = req.body || {};
  if (!process.env.DOCKER_USER) return res.status(500).json({ error: 'Server is missing DOCKER_USER in .env' });
  if (typeof fullName !== 'string' || !REPO_RE.test(fullName)) return res.status(400).json({ error: 'Invalid repository' });
  if (typeof branch !== 'string' || !BRANCH_RE.test(branch) || branch.startsWith('-') || branch.includes('..')) {
    return res.status(400).json({ error: 'Invalid branch name' });
  }
  let p = null;
  if (port !== undefined && port !== null && port !== '') {
    p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return res.status(400).json({ error: 'Port must be between 1 and 65535' });
  }
  const r = replicas === undefined || replicas === '' ? 2 : Number(replicas);
  if (!Number.isInteger(r) || r < 1 || r > 3) return res.status(400).json({ error: 'Replicas must be 1, 2 or 3' });

  const [owner, repo] = fullName.split('/');
  try { await gh.getRepo(req.session.token, owner, repo); } // access check with the user's own token
  catch (e) { return res.status(404).json({ error: 'Repository not found or not accessible with your GitHub account.' }); }

  if (store.isRunning(fullName)) return res.status(409).json({ error: 'A deployment for this repository is already running.' });
  const dep = start(req, { fullName, branch, port: p, replicas: r, trigger: 'manual' });
  res.status(202).json({ deploymentId: dep.id });
});

router.get('/api/deployments', requireAuth, (req, res) => {
  res.json({ deployments: store.listByOwner(req.session.user.login).map(store.publicView) });
});

router.get('/api/deployments/:id', requireAuth, (req, res) => {
  const dep = owned(req, res); if (!dep) return;
  const since = Math.max(0, parseInt(req.query.since, 10) || 0);
  res.json({ ...store.publicView(dep), logs: dep.logs.slice(since), logCount: dep.logs.length });
});

router.post('/api/deployments/:id/redeploy', requireAuth, limiter, (req, res) => {
  const dep = owned(req, res); if (!dep) return;
  if (store.isRunning(dep.fullName)) return res.status(409).json({ error: 'A deployment for this repository is already running.' });
  const n = start(req, { fullName: dep.fullName, branch: dep.branch, port: dep.requestedPort, replicas: dep.replicas, trigger: 'manual' });
  res.status(202).json({ deploymentId: n.id });
});

// Removes the app from the cluster and clears its history (all records for the repo).
router.delete('/api/deployments/:id', requireAuth, async (req, res) => {
  const dep = owned(req, res); if (!dep) return;
  if (store.isRunning(dep.fullName)) return res.status(409).json({ error: 'Wait for the running deployment to finish first.' });
  if (dep.appName) {
    try {
      await run('kubectl', ['delete', 'deployment,service', dep.appName, '-n', dep.namespace, '--ignore-not-found'], { timeoutMs: 60000 });
    } catch (e) { return res.status(500).json({ error: 'kubectl delete failed: ' + e.message }); }
  }
  store.removeApp(dep.ownerLogin, dep.fullName);
  store.deleteLink(dep.fullName); // webhook events for this repo are ignored from now on
  res.json({ ok: true });
});

router.get('/deployments', requireAuth, (req, res) => {
  res.render('deployments', { title: 'Deployments', active: 'deployments', scripts: ['/js/deployments.js'] });
});
router.get('/deployments/:id', requireAuth, (req, res) => {
  const dep = store.get(req.params.id);
  if (!dep || dep.ownerLogin !== req.session.user.login) return res.status(404).send('Deployment not found');
  res.render('deployment-detail', { title: dep.repo, active: 'deployments', bodyData: dep.id, scripts: ['/js/detail.js'] });
});

module.exports = router;
