// Single smoke test: node scripts/smoke.js (no network, no docker, no cluster needed)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { detect, guess } = require('../services/detector');
const { dockerfileFor } = require('../services/dockerfiles');
const { render, sanitizeName } = require('../services/manifest');
const { redactText } = require('../services/shell');

const sampleDir = fs.existsSync(path.join(__dirname, '..', '..', 'sample-repos'))
  ? path.join(__dirname, '..', '..', 'sample-repos')
  : (fs.existsSync(path.join(__dirname, '..', 'sample-repos'))
    ? path.join(__dirname, '..', 'sample-repos')
    : path.join(__dirname, 'sample-repos'));
const s = (n) => path.join(sampleDir, n);

assert.strictEqual(detect(s('node-sample')).stack, 'node');
assert.strictEqual(detect(s('python-sample')).stack, 'python');
assert.strictEqual(detect(s('static-sample')).stack, 'static');
assert.deepStrictEqual(guess(['Dockerfile'], 'FROM x\nEXPOSE 8080'), { stack: 'existing-dockerfile', port: 8080 });
assert.strictEqual(guess(['README.md'], '').stack, null);

assert.ok(dockerfileFor(detect(s('node-sample')), 3000).includes('CMD ["npm", "start"]'));
assert.ok(dockerfileFor(detect(s('python-sample')), 8000).includes('CMD ["python", "app.py"]'));

assert.strictEqual(sanitizeName('My_Repo.Name!'), 'my-repo-name');
assert.strictEqual(sanitizeName('---'), 'app');
const y = render({ name: 'x', namespace: 'deployhub', image: 'u/x:abc1234', port: 3000, replicas: 2, mode: 'cloud', repo: 'o/x', commit: 'abc' });
assert.ok(y.includes('type: LoadBalancer') && y.includes('replicas: 2'));
assert.ok(render({ name: 'x', namespace: 'n', image: 'i', port: 1, replicas: 1, mode: 'local' }).includes('type: NodePort'));

assert.strictEqual(redactText('clone https://x-access-token:SECRET@github.com', ['SECRET']), 'clone https://x-access-token:***@github.com');
const crypto = require('crypto');
const { verifySignature } = require('../services/github');
const body = Buffer.from('{"a":1}');
const sig = 'sha256=' + crypto.createHmac('sha256', 'k').update(body).digest('hex');
assert.ok(verifySignature(body, sig, 'k'));
assert.ok(!verifySignature(body, sig, 'other'));
assert.ok(!verifySignature(body, 'sha256=00', 'k'));
assert.ok(!verifySignature(body, undefined, 'k'));

const { isAllowed } = require('../services/access');
delete process.env.ALLOWED_GITHUB_USERS;
assert.ok(isAllowed('anyone'));
process.env.ALLOWED_GITHUB_USERS = ' Alice, bob ';
assert.ok(isAllowed('alice') && isAllowed('BOB') && !isAllowed('mallory'));

console.log('smoke: all checks passed');
