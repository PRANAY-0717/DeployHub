// Deployment detail: stepper, live log console, summary + actions. Polls until the run finishes.
(function () {
  const id = document.getElementById('detail').dataset.id;
  const STEPS = ['Clone', 'Detect', 'Generate', 'Build', 'Push', 'Deploy', 'Live'];
  const $ = (x) => document.getElementById(x);
  let dep = null;
  let offset = 0;

  function stepState(i) {
    if (dep.status === 'live') return 'done';
    if (dep.status === 'failed') { const f = dep.failedIndex || 0; return i < f ? 'done' : i === f ? 'failed' : 'pending'; }
    return i < dep.stageIndex ? 'done' : i === dep.stageIndex ? 'running' : 'pending';
  }

  function renderAll() {
    $('head').innerHTML = '<h1>' + esc(dep.fullName) + '</h1><span class="chip">' + esc(dep.branch) + '</span>' +
      (dep.commit ? '<span class="chip">' + esc(dep.commit.slice(0, 7)) + '</span>' : '') + statusPill(dep);

    $('banner').innerHTML = dep.status === 'failed'
      ? '<div class="banner banner-error"><strong>Failed at ' + esc(STEPS[dep.failedIndex || 0]) + ':</strong> ' + esc(dep.error) + '</div>' : '';

    $('stepper').innerHTML = STEPS.map((s, i) => {
      const st = stepState(i);
      const icon = st === 'done' ? '✓' : st === 'failed' ? '✕' : st === 'running' ? '' : i + 1;
      return '<div class="step ' + st + '"><div class="dot">' + icon + '</div><span>' + s + '</span></div>';
    }).join('');

    const row = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
    const dash = '<span class="muted">-</span>';
    const running = dep.status === 'running';
    $('summary').innerHTML = '<h3 style="margin-bottom:12px">Summary</h3><dl>' +
      row('Stack', dep.stack ? esc(dep.stack) : dash) +
      row('Image', dep.image ? '<span class="mono">' + esc(dep.image) + '</span>' : dash) +
      row('Namespace', dep.namespace ? esc(dep.namespace) : dash) +
      row('Replicas', esc(dep.replicas)) +
      row('Port', dep.port ? esc(dep.port) : dash) +
      row('Trigger', esc(dep.trigger)) +
      row('Started', new Date(dep.startedAt).toLocaleString()) +
      row('Duration', fmtDuration((dep.finishedAt || Date.now()) - dep.startedAt)) +
      row('URL', dep.url ? '<a href="' + esc(dep.url) + '" target="_blank" rel="noopener">' + esc(dep.url) + '</a>' : dash) +
      '</dl><div class="actions" style="margin-top:16px">' +
      (dep.url ? '<a class="btn btn-primary btn-sm" href="' + esc(dep.url) + '" target="_blank" rel="noopener">Open app</a>' : '') +
      '<button class="btn btn-sm" data-act="redeploy"' + (running ? ' disabled' : '') + '>Redeploy</button>' +
      '<button class="btn btn-danger btn-sm" data-act="delete"' + (running ? ' disabled' : '') + '>Delete</button></div>';
  }

  function lineHtml(raw) {
    const m = /^(\d\d:\d\d:\d\d)\s\s([\s\S]*)$/.exec(raw) || [null, '', raw];
    const msg = m[2];
    let cls = '';
    if (msg.startsWith('$ ')) cls = 'cmd';
    else if (msg.startsWith('▶')) cls = 'stage';
    else if (msg.startsWith('ERROR')) cls = 'err';
    else if (msg.startsWith('Warning')) cls = 'warn';
    else if (msg.startsWith('✔')) cls = 'ok';
    return '<div class="ln ' + cls + '"><span class="ts">' + esc(m[1]) + '</span>' + esc(msg) + '</div>';
  }

  function appendLogs(lines) {
    if (!lines.length) return;
    const c = $('console');
    const stick = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    if (offset === lines.length || c.querySelector('.console-empty')) c.innerHTML = '';
    c.insertAdjacentHTML('beforeend', lines.map(lineHtml).join(''));
    if (stick) c.scrollTop = c.scrollHeight;
  }

  async function poll() {
    try {
      const d = await api('/api/deployments/' + id + '?since=' + offset);
      const first = offset === 0;
      dep = d;
      if (first) $('console').innerHTML = '';
      offset = d.logCount;
      appendLogs(d.logs);
      renderAll();
      if (d.status === 'running') setTimeout(poll, 1500);
    } catch (e) {
      if (/not found/i.test(e.message)) { location.href = '/deployments'; return; }
      toast(e.message, 'error');
      setTimeout(poll, 4000);
    }
  }

  document.getElementById('summary').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    b.disabled = true;
    try {
      if (b.dataset.act === 'redeploy') {
        const d = await api('/api/deployments/' + id + '/redeploy', { method: 'POST', body: '{}' });
        location.href = '/deployments/' + d.deploymentId;
      } else if (confirm('Remove this app from the cluster and delete its deployment history?')) {
        await api('/api/deployments/' + id, { method: 'DELETE' });
        toast('App deleted', 'success');
        location.href = '/deployments';
      } else b.disabled = false;
    } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  poll();
})();
