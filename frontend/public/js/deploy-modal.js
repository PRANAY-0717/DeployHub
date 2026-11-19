// Deploy dialog (opened from the repo cards): branch, container port, replicas.
(function () {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop hidden';
  wrap.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">' +
      '<div class="modal-header">' +
        '<div>' +
          '<h2 id="m-title">Deploy Repository</h2>' +
          '<div class="sub">Configure container parameters and roll out to Kubernetes.</div>' +
        '</div>' +
        '<button class="modal-close" id="m-close" type="button" aria-label="Close dialog">&times;</button>' +
      '</div>' +
      '<div class="field">' +
        '<label for="m-branch">Target Git Branch</label>' +
        '<select id="m-branch"></select>' +
      '</div>' +
      '<div class="field">' +
        '<label for="m-port">Container Port</label>' +
        '<input id="m-port" type="number" min="1" max="65535" placeholder="Auto-detecting from repo…">' +
        '<div class="detect" id="m-detect">Detecting runtime stack…</div>' +
      '</div>' +
      '<div class="field">' +
        '<label for="m-rep">Pod Replicas</label>' +
        '<select id="m-rep">' +
          '<option value="1">1 replica (development)</option>' +
          '<option value="2" selected>2 replicas (recommended high-availability)</option>' +
          '<option value="3">3 replicas (redundant)</option>' +
        '</select>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" id="m-cancel" type="button">Cancel</button>' +
        '<button class="btn btn-primary" id="m-start" type="button">Start deployment</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);

  const $ = (id) => document.getElementById(id);
  let repo = null;
  let seq = 0;

  const close = () => wrap.classList.add('hidden');
  $('m-cancel').onclick = close;
  $('m-close').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  async function detect() {
    const my = ++seq;
    const box = $('m-detect');
    box.className = 'detect'; box.textContent = 'Detecting stack…';
    try {
      const d = await api('/api/repos/' + repo.fullName + '/detect?branch=' + encodeURIComponent($('m-branch').value));
      if (my !== seq) return;
      if (!d.stack) {
        box.className = 'detect warn';
        box.textContent = 'No supported stack found in the repo root. Supported: Node, Python, static, or your own Dockerfile.';
        return;
      }
      box.className = 'detect ok'; box.textContent = 'Detected stack: ' + d.stack + (d.port ? ' (default port ' + d.port + ')' : '');
      if (d.port && !$('m-port').dataset.touched) $('m-port').value = d.port;
    } catch (e) { if (my === seq) { box.className = 'detect warn'; box.textContent = 'Could not detect: ' + e.message; } }
  }

  $('m-port').addEventListener('input', () => { $('m-port').dataset.touched = '1'; });
  $('m-branch').addEventListener('change', detect);

  window.openDeployModal = async function (r) {
    repo = r;
    $('m-title').textContent = r.fullName;
    $('m-port').value = ''; delete $('m-port').dataset.touched;
    $('m-rep').value = '2';
    $('m-branch').innerHTML = '<option>' + esc(r.defaultBranch) + '</option>';
    wrap.classList.remove('hidden');
    api('/api/repos/' + r.fullName + '/branches').then((d) => {
      $('m-branch').innerHTML = d.branches.map((b) => '<option' + (b === r.defaultBranch ? ' selected' : '') + '>' + esc(b) + '</option>').join('');
    }).catch(() => {});
    detect();
  };

  $('m-start').onclick = async () => {
    const btn = $('m-start');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting…';
    try {
      const d = await api('/api/deploy', {
        method: 'POST',
        body: JSON.stringify({ fullName: repo.fullName, branch: $('m-branch').value, port: $('m-port').value, replicas: $('m-rep').value }),
      });
      location.href = '/deployments/' + d.deploymentId;
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = 'Start deployment';
    }
  };
})();
