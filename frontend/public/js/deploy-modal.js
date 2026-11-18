// Deploy dialog (opened from the repo cards): branch, container port, replicas.
(function () {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop hidden';
  wrap.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">' +
    '<h2 id="m-title"></h2><div class="sub">Build a container image and deploy it to Kubernetes.</div>' +
    '<div class="field"><label for="m-branch">Branch</label><select id="m-branch"></select></div>' +
    '<div class="field"><label for="m-port">Container port</label><input id="m-port" type="number" min="1" max="65535" placeholder="Auto-detect">' +
    '<div class="detect" id="m-detect"></div></div>' +
    '<div class="field"><label for="m-rep">Replicas</label><select id="m-rep"><option>1</option><option selected>2</option><option>3</option></select></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" id="m-cancel" type="button">Cancel</button>' +
    '<button class="btn btn-primary" id="m-start" type="button">Start deployment</button></div></div>';
  document.body.appendChild(wrap);

  const $ = (id) => document.getElementById(id);
  let repo = null;
  let seq = 0;

  const close = () => wrap.classList.add('hidden');
  $('m-cancel').onclick = close;
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
      box.className = 'detect ok'; box.textContent = 'Detected: ' + d.stack;
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
