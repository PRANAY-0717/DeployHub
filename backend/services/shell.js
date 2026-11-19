// Safe process runner: spawn() with an args array (never a shell string),
// per-command timeout, live line streaming, and secret redaction.
const { spawn } = require('child_process');

function redactText(text, secrets = []) {
  return secrets.filter(Boolean).reduce((acc, s) => acc.split(s).join('***'), String(text));
}

function run(cmd, args = [], opts = {}) {
  const { cwd, timeoutMs = 60000, onLine, secrets = [], env, input } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
    let stdout = '';
    const emit = (buf) => {
      if (!onLine) return;
      buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => onLine(redactText(l, secrets)));
    };
    child.stdout.on('data', (b) => { stdout += b.toString(); emit(b); });
    child.stderr.on('data', emit);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} ${args[0] || ''} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start "${cmd}": ${e.message}. Is it installed and on PATH?`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(redactText(stdout, secrets));
      else reject(new Error(`${cmd} ${args[0] || ''} failed (exit code ${code})`));
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

module.exports = { run, redactText };
