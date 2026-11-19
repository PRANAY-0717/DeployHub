(function () {
  const grid = document.getElementById('grid');
  const search = document.getElementById('search');
  const langSel = document.getElementById('lang');
  const colors = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', Dart: '#00B4AB', Rust: '#dea584', Dockerfile: '#384d54' };
  let repos = [];

  function deployedBadge(d) {
    if (!d) return '';
    const map = {
      live: ['pill-live', 'Live ✓'],
      running: ['pill-running', 'Deploying…'],
      failed: ['pill-failed', 'Failed']
    };
    const m = map[d.status] || map.failed;
    return '<a class="pill ' + m[0] + '" href="/deployments/' + esc(d.id) + '">' + m[1] + '</a>';
  }

  function card(r) {
    const lang = r.language
      ? '<span class="repo-meta-item"><span class="lang-dot" style="background:' + (colors[r.language] || '#8b949e') + '"></span>' + esc(r.language) + '</span>' : '';
    return '<article class="card repo-card">' +
      '<div class="card-top">' +
        '<div class="repo-title-row">' +
          '<svg class="repo-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
          '<a class="repo-name" href="' + esc(r.htmlUrl) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' +
        '</div>' +
        '<div class="repo-badges">' +
          '<span class="pill ' + (r.private ? 'pill-private' : 'pill-public') + '">' + (r.private ? 'Private' : 'Public') + '</span>' +
          deployedBadge(r.deployment) +
        '</div>' +
      '</div>' +
      '<div class="repo-desc">' + esc(r.description || 'No description provided.') + '</div>' +
      '<div class="card-meta">' +
        lang +
        '<span class="chip mono">' + esc(r.defaultBranch) + '</span>' +
        '<span class="repo-meta-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + timeAgo(r.pushedAt) + '</span>' +
      '</div>' +
      '<div class="card-foot">' +
        '<span class="repo-full-name muted mono">' + esc(r.fullName) + '</span>' +
        '<button class="btn btn-primary btn-sm" data-deploy="' + esc(r.fullName) + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
          ' Deploy' +
        '</button>' +
      '</div>' +
      '</article>';
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const lang = langSel.value;
    const list = repos.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!lang || r.language === lang));
    grid.innerHTML = list.length
      ? list.map(card).join('')
      : '<div class="empty-state"><p class="muted">No repositories match your search filter.</p></div>';
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deploy]');
    if (!b) return;
    const repo = repos.find((r) => r.fullName === b.dataset.deploy);
    if (window.openDeployModal) window.openDeployModal(repo);
    else toast('Deploy dialog is opening…', 'info');
  });

  search.addEventListener('input', render);
  langSel.addEventListener('change', render);

  api('/api/repos').then((d) => {
    repos = d.repos;
    [...new Set(repos.map((r) => r.language).filter(Boolean))].sort()
      .forEach((l) => langSel.insertAdjacentHTML('beforeend', '<option>' + esc(l) + '</option>'));
    render();
  }).catch((e) => {
    grid.innerHTML = '<div class="empty-state error"><p>' + esc(e.message) + '</p></div>';
  });
})();
