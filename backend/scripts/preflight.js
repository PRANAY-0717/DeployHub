// npm run preflight: checks tools, cluster access and .env before you demo.
const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} else {
  require('dotenv').config();
}
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let fails = 0;
const pass = (m) => console.log('  PASS  ' + m);
const warn = (m) => console.log('  WARN  ' + m);
const fail = (m, fix) => { fails++; console.log('  FAIL  ' + m + (fix ? '\n          fix: ' + fix : '')); };
const sh = (c, a) => spawnSync(c, a, { encoding: 'utf8', timeout: 20000 });
const env = (k) => (process.env[k] || '').trim();

console.log('\nTools');
const major = Number(process.versions.node.split('.')[0]);
major >= 20 ? pass(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} (need 20+)`, 'install Node 20');
sh('git', ['--version']).status === 0 ? pass('git installed') : fail('git not found', 'sudo apt install git');
sh('docker', ['info']).status === 0 ? pass('docker daemon reachable') : fail('docker not usable by this user', 'install docker, then: sudo usermod -aG docker $USER and log in again');
const nodes = sh('kubectl', ['get', 'nodes', '--no-headers']);
nodes.status === 0 ? pass('kubectl reaches the cluster: ' + nodes.stdout.trim().split('\n').length + ' node(s)') : fail('kubectl cannot reach a cluster', 'check ~/.kube/config (k3s: sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config)');

console.log('\nGitHub OAuth');
env('GITHUB_CLIENT_ID') ? pass('GITHUB_CLIENT_ID set') : fail('GITHUB_CLIENT_ID missing', 'create an OAuth App in GitHub developer settings');
env('GITHUB_CLIENT_SECRET') ? pass('GITHUB_CLIENT_SECRET set') : fail('GITHUB_CLIENT_SECRET missing');
const base = env('BASE_URL');
if (!base) fail('BASE_URL missing');
else {
  pass('BASE_URL = ' + base);
  console.log('        OAuth App callback URL must be exactly: ' + base.replace(/\/$/, '') + '/auth/callback');
  if (/localhost|127\.0\.0\.1/.test(base)) warn('BASE_URL is localhost: webhooks will not work and the app is not reachable from other machines');
}

console.log('\nDocker Hub');
env('DOCKER_USER') ? pass('DOCKER_USER = ' + env('DOCKER_USER')) : fail('DOCKER_USER missing');
let loggedIn = !!env('DOCKER_PASS');
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.docker', 'config.json'), 'utf8'));
  loggedIn = loggedIn || Object.keys(cfg.auths || {}).length > 0 || !!cfg.credsStore;
} catch (e) { /* no docker config */ }
loggedIn ? pass('Docker Hub credentials available (DOCKER_PASS or docker login)') : fail('No Docker Hub credentials', 'set DOCKER_PASS to an access token or run: docker login');

console.log('\nSecurity and mode');
const weak = (v) => !v || /^change-me/i.test(v);
weak(env('SESSION_SECRET')) ? fail('SESSION_SECRET is empty or the default', 'openssl rand -hex 32') : pass('SESSION_SECRET set');
weak(env('WEBHOOK_SECRET')) ? fail('WEBHOOK_SECRET is empty or the default', 'openssl rand -hex 20') : pass('WEBHOOK_SECRET set');
const mode = env('CLUSTER_MODE') || 'cloud';
pass('CLUSTER_MODE = ' + mode);
if (mode === 'local' && !env('LOCAL_HOST')) warn('CLUSTER_MODE=local without LOCAL_HOST: the node InternalIP will be used in app URLs (set it to the VM public IP)');
env('ALLOWED_GITHUB_USERS') ? pass('Sign-in restricted to: ' + env('ALLOWED_GITHUB_USERS')) : warn('ALLOWED_GITHUB_USERS empty: any GitHub user can sign in and deploy to your cluster');

console.log(fails ? `\n${fails} problem(s) to fix.\n` : '\nAll required checks passed.\n');
process.exit(fails ? 1 : 0);
