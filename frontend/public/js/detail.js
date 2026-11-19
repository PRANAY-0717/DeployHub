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
    $('head').innerHTML =
      '<div class="detail-header-left">' +
        '<h1>' + esc(dep.fullName) + '</h1>' +
        '<div class="detail-header-meta">' +
          '<span class="chip mono">' + esc(dep.branch) + '</span>' +
          (dep.commit ? '<span class="chip mono">' + esc(dep.commit.slice(0, 7)) + '</span>' : '') +
          statusPill(dep) +
        '</div>' +
      '</div>' +
      '<div class="detail-header-right">' +
        (dep.url ? '<a class="btn btn-primary btn-sm" href="' + esc(dep.url) + '" target="_blank" rel="noopener">Open Application ↗</a>' : '') +
      '</div>';

    $('banner').innerHTML = dep.status === 'failed'
      ? '<div class="banner banner-error"><strong>Pipeline failed at ' + esc(STEPS[dep.failedIndex || 0]) + ':</strong> ' + esc(dep.error) + '</div>' : '';

    $('stepper').innerHTML = STEPS.map((s, i) => {
      const st = stepState(i);
      const icon = st === 'done' ? '✓' : st === 'failed' ? '✕' : st === 'running' ? '<span class="spinner-small"></span>' : (i + 1);
      return '<div class="step ' + st + '"><div class="dot">' + icon + '</div><span class="step-title">' + s + '</span></div>';
    }).join('');

    const row = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
    const dash = '<span class="muted">-</span>';
    const running = dep.status === 'running';

    $('summary').innerHTML =
      '<h3 class="summary-title">Deployment Spec</h3>' +
      '<dl class="summary-list">' +
        row('Runtime Stack', dep.stack ? '<span class="chip">' + esc(dep.stack) + '</span>' : dash) +
        row('Container Image', dep.image ? '<span class="chip mono">' + esc(dep.image) + '</span>' : dash) +
        row('k8s Namespace', dep.namespace ? '<span class="mono">' + esc(dep.namespace) + '</span>' : dash) +
        row('Pod Replicas', esc(dep.replicas) + ' active') +
        row('Target Port', dep.port ? '<span class="mono">' + esc(dep.port) + '</span>' : dash) +
        row('Trigger Source', '<span class="trigger-badge">' + esc(dep.trigger) + '</span>') +
        row('Started At', new Date(dep.startedAt).toLocaleTimeString()) +
        row('Total Duration', fmtDuration((dep.finishedAt || Date.now()) - dep.startedAt)) +
        row('Cluster Route', dep.url ? '<a class="endpoint-link" href="' + esc(dep.url) + '" target="_blank" rel="noopener">' + esc(dep.url) + ' ↗</a>' : dash) +
      '</dl>' +
      '<div class="summary-actions">' +
        '<button class="btn btn-sm" data-act="redeploy"' + (running ? ' disabled' : '') + '>' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          ' Redeploy' +
        '</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete"' + (running ? ' disabled' : '') + '>' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          ' Tear Down' +
        '</button>' +
      '</div>';
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
    return '<div class="ln ' + cls + '"><span class="ts">' + esc(m[1]) + '</span><span class="ln-body">' + esc(msg) + '</span></div>';
  }

  function appendLogs(lines) {
    if (!lines.length) return;
    const c = $('console');
    const stick = c.scrollHeight - c.scrollTop - c.clientHeight < 50;
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
        toast('Application deleted from cluster', 'success');
        location.href = '/deployments';
      } else b.disabled = false;
    } catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  poll();
})();
