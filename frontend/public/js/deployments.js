(function () {
  const wrap = document.getElementById('wrap');

  function render(list) {
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-box">No deployments yet.<br><a class="btn btn-primary" href="/repos">Deploy your first repo</a></div>';
      return;
    }
    wrap.innerHTML = '<table><thead><tr><th>Repository</th><th>Branch</th><th>Commit</th><th>Status</th><th>Trigger</th><th>Started</th><th>Duration</th><th>URL</th></tr></thead><tbody>' +
      list.map((d) =>
        '<tr data-href="/deployments/' + esc(d.id) + '"><td><strong>' + esc(d.fullName) + '</strong></td>' +
        '<td class="mono">' + esc(d.branch) + '</td>' +
        '<td>' + (d.commit ? '<span class="chip">' + esc(d.commit.slice(0, 7)) + '</span>' : '<span class="muted">-</span>') + '</td>' +
        '<td>' + statusPill(d) + '</td><td>' + esc(d.trigger) + '</td>' +
        '<td>' + timeAgo(d.startedAt) + '</td>' +
        '<td>' + fmtDuration((d.finishedAt || Date.now()) - d.startedAt) + '</td>' +
        '<td>' + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.url.replace('http://', '')) + '</a>' : '<span class="muted">-</span>') + '</td></tr>'
      ).join('') + '</tbody></table>';
  }

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.href = tr.dataset.href;
  });

  async function load() {
    try {
      const d = await api('/api/deployments');
      render(d.deployments);
      if (d.deployments.some((x) => x.status === 'running')) setTimeout(load, 3000);
    } catch (e) { wrap.innerHTML = '<div class="empty-box">' + esc(e.message) + '</div>'; }
  }
  load();
})();
