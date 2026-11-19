// Guards routes: pages redirect to the login screen, API calls get a 401 JSON.
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.token && req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/');
};
