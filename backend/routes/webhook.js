// GitHub push webhook -> automatic redeploy (the "CD" half of CI/CD).
const express = require('express');
const store = require('../services/store');
const gh = require('../services/github');
const { runPipeline } = require('../services/pipeline');

const router = express.Router();

router.post('/github', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return res.status(503).send('Webhook disabled: WEBHOOK_SECRET not set');
  if (!gh.verifySignature(req.body, req.get('X-Hub-Signature-256'), secret)) return res.status(401).send('Invalid signature');

  const event = req.get('X-GitHub-Event');
  if (event === 'ping') return res.send('pong');
  if (event !== 'push') return res.status(202).send('Ignored event');

  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch (e) { return res.status(400).send('Bad JSON'); }

  const fullName = payload.repository && payload.repository.full_name;
  const link = fullName && store.getLink(fullName);
  if (!link) return res.status(202).send('Repository is not managed by DeployHub');
  if (payload.deleted || payload.ref !== `refs/heads/${link.branch}`) return res.status(202).send('Not the deployed branch');
  if (store.isRunning(fullName)) return res.status(202).send('A deployment is already running');

  const dep = store.create({ fullName, branch: link.branch, ownerLogin: link.ownerLogin, trigger: 'webhook', port: link.port, replicas: link.replicas });
  store.log(dep, `Triggered by push to ${link.branch}${payload.after ? ' (' + String(payload.after).slice(0, 7) + ')' : ''}`);
  runPipeline(dep, link.token);
  res.status(202).json({ deploymentId: dep.id });
});

module.exports = router;
