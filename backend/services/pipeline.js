// Orchestrates one deployment: Clone -> Detect -> Generate -> Build -> Push -> Deploy -> Live.
// runPipeline() never throws; failures are recorded on the deployment object.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, redactText } = require('./shell');
const store = require('./store');
const { detect } = require('./detector');
const { dockerfileFor, DOCKERIGNORE } = require('./dockerfiles');
const { render, sanitizeName } = require('./manifest');
const gh = require('./github');

const T = { clone: 60e3, build: 600e3, push: 300e3, kubectl: 60e3, rollout: 150e3, lb: 120e3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPipeline(dep, token) {
  // Per-user isolation: each GitHub user gets their own namespace (e.g. deployhub-octocat).
  const userSlug = sanitizeName(dep.ownerLogin);
  const ns = `${process.env.K8S_NAMESPACE || 'deployhub'}-${userSlug}`;
  const mode = process.env.CLUSTER_MODE === 'local' ? 'local' : 'cloud';
  const dir = path.join(os.tmpdir(), 'deployhub', dep.id);
  const secrets = [token, process.env.DOCKER_PASS];
  const L = (line) => store.log(dep, line);

  const sh = (cmd, args, o = {}) => {
    if (!o.quiet) L('$ ' + redactText([cmd, ...args].join(' '), secrets));
    return run(cmd, args, { ...o, secrets, onLine: o.quiet ? undefined : (l) => L('  ' + l) });
  };
  const stage = (i) => { dep.stageIndex = i; dep.stage = store.STAGES[i]; L(`▶ ${dep.stage}`); };

  try {
    fs.mkdirSync(path.dirname(dir), { recursive: true });

    stage(0); // Cloning
    await sh('git', ['clone', '--depth', '1', '--branch', dep.branch,
      `https://x-access-token:${token}@github.com/${dep.fullName}.git`, dir],
    { timeoutMs: T.clone, env: { GIT_TERMINAL_PROMPT: '0' } });
    dep.commit = (await sh('git', ['rev-parse', 'HEAD'], { cwd: dir, quiet: true })).trim();
    L(`Commit ${dep.commit.slice(0, 7)} on ${dep.branch}`);

    stage(1); // Detecting
    const info = detect(dir);
    dep.stack = info.stack;
    L(`Detected stack: ${info.stack}`);
    const port = info.stack === 'static' ? 80 : (dep.requestedPort || info.port);
    if (!port) throw new Error('Could not determine the container port. Set it in the deploy dialog.');
    dep.port = port;
    L(`Container port: ${port}`);

    stage(2); // Generating
    if (info.stack === 'existing-dockerfile') {
      L('Repository has its own Dockerfile, using it as-is.');
    } else {
      const content = dockerfileFor(info, port);
      fs.writeFileSync(path.join(dir, 'Dockerfile'), content);
      L('Generated Dockerfile:');
      content.trim().split('\n').forEach((l) => L('  | ' + l));
      const ignorePath = path.join(dir, '.dockerignore');
      if (!fs.existsSync(ignorePath)) fs.writeFileSync(ignorePath, DOCKERIGNORE);
    }

    stage(3); // Building
    const name = sanitizeName(dep.repo);
    dep.appName = name;
    dep.namespace = ns;
    const tag = (dep.commit || String(Date.now())).slice(0, 7);
    dep.image = `${process.env.DOCKER_USER}/${userSlug}-${name}:${tag}`; // user prefix avoids image-name clashes
    const buildArgs = ['build', '-t', dep.image];
    if (process.env.DOCKER_PLATFORM) buildArgs.push('--platform', process.env.DOCKER_PLATFORM);
    buildArgs.push('.');
    await sh('docker', buildArgs, { cwd: dir, timeoutMs: T.build });

    stage(4); // Pushing
    if (process.env.DOCKER_PASS) {
      await sh('docker', ['login', '-u', process.env.DOCKER_USER, '--password-stdin'],
        { input: process.env.DOCKER_PASS, timeoutMs: T.kubectl });
    }
    await sh('docker', ['push', dep.image], { timeoutMs: T.push });

    stage(5); // Deploying
    try {
      await sh('kubectl', ['get', 'namespace', ns], { quiet: true, timeoutMs: T.kubectl });
    } catch (e) {
      await sh('kubectl', ['create', 'namespace', ns], { timeoutMs: T.kubectl });
    }
    const manifestPath = path.join(dir, 'k8s.yaml');
    fs.writeFileSync(manifestPath, render({
      name, namespace: ns, image: dep.image, port, replicas: dep.replicas, mode, repo: dep.fullName, commit: dep.commit,
    }));
    await sh('kubectl', ['apply', '-f', manifestPath], { timeoutMs: T.kubectl });
    await sh('kubectl', ['rollout', 'status', `deployment/${name}`, '-n', ns, '--timeout=120s'], { timeoutMs: T.rollout });

    stage(6); // Live
    dep.url = await resolveUrl(sh, L, name, ns, mode);

    dep.stageIndex = store.STAGES.length;
    dep.status = 'live';
    L(`✔ Live at ${dep.url}`);

    // Register the push webhook once (skipped on localhost); failure here never fails the deployment.
    try {
      const link = store.getLink(dep.fullName);
      if (link && !link.webhookId) {
        const r = await gh.ensureWebhook(token, dep.fullName);
        if (r.skipped) L('Warning: webhook not created. ' + r.reason);
        else {
          store.setLink(dep.fullName, { webhookId: r.id || true });
          L(r.created ? '✔ Webhook created: pushes to this branch will redeploy automatically.' : '✔ Webhook already registered.');
        }
      }
    } catch (e) {
      L('Warning: could not create webhook: ' + redactText(e.message, secrets));
    }
  } catch (err) {
    dep.status = 'failed';
    dep.failedIndex = Math.max(0, dep.stageIndex);
    dep.error = redactText(err.message, secrets);
    L(`ERROR: ${dep.error}`);
  } finally {
    dep.finishedAt = Date.now();
    store.touch();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function resolveUrl(sh, L, name, ns, mode) {
  const getSvc = async () => JSON.parse(await sh('kubectl', ['get', 'svc', name, '-n', ns, '-o', 'json'], { quiet: true, timeoutMs: T.kubectl }));
  if (mode === 'local') {
    const svc = await getSvc();
    const nodePort = svc.spec.ports[0].nodePort;
    let host = process.env.LOCAL_HOST;
    if (!host) {
      host = (await sh('kubectl', ['get', 'nodes', '-o', 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}'],
        { quiet: true, timeoutMs: T.kubectl })).trim();
    }
    L(`Tip: if that address is not reachable from your browser, run: kubectl port-forward svc/${name} 8080:80 -n ${ns}`);
    return `http://${host}:${nodePort}`;
  }
  const deadline = Date.now() + T.lb;
  while (Date.now() < deadline) {
    const ing = ((await getSvc()).status || {}).loadBalancer;
    const first = ing && ing.ingress && ing.ingress[0];
    if (first) return `http://${first.hostname || first.ip}`;
    L('Waiting for the load balancer address…');
    await sleep(5000);
  }
  throw new Error('Timed out waiting for a LoadBalancer address. If your cluster has no load balancer, set CLUSTER_MODE=local.');
}

module.exports = { runPipeline };
