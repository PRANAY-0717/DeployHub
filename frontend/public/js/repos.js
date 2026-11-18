(function () {
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const langSel = document.getElementById('lang');
  const colors = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', Dart: '#00B4AB', Rust: '#dea584', Dockerfile: '#384d54' };
  let repos = [];

  function deployedBadge(d) {
    if (!d) return '';
    const map = { live: ['pill-live', 'Deployed ✓'], running: ['pill-running', 'Deploying'], failed: ['pill-failed', 'Last deploy failed'] };
    const m = map[d.status] || map.failed;
    return '<a class="pill ' + m[0] + '" href="/deployments/' + esc(d.id) + '">' + m[1] + '</a>';
  }

  function card(r) {
    const lang = r.language
      ? '<span><span class="lang-dot" style="background:' + (colors[r.language] || '#8b949e') + '"></span>' + esc(r.language) + '</span>' : '';
    return '<article class="card">' +
      '<div class="card-top"><a class="repo-name" href="' + esc(r.htmlUrl) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' +
      '<span class="pill ' + (r.private ? 'pill-private' : 'pill-public') + '">' + (r.private ? 'Private' : 'Public') + '</span>' +
      deployedBadge(r.deployment) + '</div>' +
      '<div class="repo-desc">' + esc(r.description || 'No description') + '</div>' +
      '<div class="card-meta">' + lang + '<span class="mono">' + esc(r.defaultBranch) + '</span><span>pushed ' + timeAgo(r.pushedAt) + '</span></div>' +
      '<div class="card-foot"><span></span><button class="btn btn-primary btn-sm" data-deploy="' + esc(r.fullName) + '">Deploy</button></div>' +
      '</article>';
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const lang = langSel.value;
    const list = repos.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!lang || r.language === lang));
    grid.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">No repositories found.</div>';
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deploy]');
    if (!b) return;
    const repo = repos.find((r) => r.fullName === b.dataset.deploy);
    if (window.openDeployModal) window.openDeployModal(repo);
    else toast('Deploy dialog is added in Phase 4.', 'info');
  });
  search.addEventListener('input', render);
  langSel.addEventListener('change', render);

  api('/api/repos').then((d) => {
    repos = d.repos;
    [...new Set(repos.map((r) => r.language).filter(Boolean))].sort()
      .forEach((l) => langSel.insertAdjacentHTML('beforeend', '<option>' + esc(l) + '</option>'));
    render();
  }).catch((e) => { grid.innerHTML = '<div class="empty error">' + esc(e.message) + '</div>'; });
})();
