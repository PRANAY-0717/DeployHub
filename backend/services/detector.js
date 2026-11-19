// Decides how a repo should be containerized. Supported: existing Dockerfile, Node, Python, static.
const fs = require('fs');
const path = require('path');

const UNSUPPORTED = 'Unsupported stack. Supported: Node (package.json), Python (requirements.txt), static site (index.html), or a repo with its own Dockerfile.';

// Pure function over a root file listing; also used by the deploy dialog (GitHub API listing).
function guess(names, dockerfileText) {
  const has = (n) => names.includes(n);
  if (has('Dockerfile')) {
    const m = /^\s*EXPOSE\s+(\d+)/im.exec(dockerfileText || '');
    return { stack: 'existing-dockerfile', port: m ? Number(m[1]) : null };
  }
  if (has('package.json')) return { stack: 'node', port: 3000 };
  if (has('requirements.txt')) return { stack: 'python', port: 8000 };
  if (has('index.html')) return { stack: 'static', port: 80 };
  return { stack: null, port: null };
}

// Full check on a cloned directory, with validation and clear error messages.
function detect(dir) {
  const names = fs.readdirSync(dir);
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const g = guess(names, names.includes('Dockerfile') ? read('Dockerfile') : '');
  if (!g.stack) throw new Error(UNSUPPORTED);

  if (g.stack === 'node') {
    let pkg;
    try { pkg = JSON.parse(read('package.json')); } catch (e) { throw new Error('package.json is not valid JSON.'); }
    if (!pkg.scripts || !pkg.scripts.start) {
      throw new Error('Node project has no "start" script in package.json. Add one, e.g. "start": "node index.js".');
    }
    return { ...g, hasLock: names.includes('package-lock.json') };
  }
  if (g.stack === 'python') {
    const entry = ['app.py', 'main.py'].find((n) => names.includes(n));
    if (!entry) throw new Error('Python project needs app.py or main.py in the repo root.');
    const gunicorn = /^\s*gunicorn\b/im.test(read('requirements.txt'));
    return { ...g, entry, gunicorn };
  }
  return g;
}

module.exports = { guess, detect, UNSUPPORTED };
