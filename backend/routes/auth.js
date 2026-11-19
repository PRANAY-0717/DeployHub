// GitHub OAuth 2.0 web flow with a random `state` value (CSRF protection).
const crypto = require('crypto');
const express = require('express');
const { isAllowed } = require('../services/access');
const router = express.Router();

router.get('/auth/github', (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.redirect('/?error=' + encodeURIComponent('GitHub OAuth is not configured on the server (.env).'));
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/auth/callback`,
    scope: 'repo',
    state,
  }).toString();
  req.session.save(() => res.redirect(url.toString()));
});

router.get('/auth/callback', async (req, res) => {
  const fail = (msg) => res.redirect('/?error=' + encodeURIComponent(msg));
  const { code, state, error } = req.query;
  if (error) return fail('GitHub login was cancelled.');
  if (!code || !state || state !== req.session.oauthState) return fail('Login failed: invalid state. Please try again.');

  try {
    // Server-to-server exchange: the client secret never reaches the browser.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BASE_URL}/auth/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return fail('Login failed: ' + (tokenData.error_description || 'no access token returned'));

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'deploysync', Accept: 'application/vnd.github+json' },
    });
    if (!userRes.ok) return fail('Login failed: could not read your GitHub profile.');
    const u = await userRes.json();
    if (!isAllowed(u.login)) return fail('This DeploySync server only allows specific GitHub accounts. Ask the owner to add yours.');

    // New session id after login prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return fail('Login failed: session error.');
      req.session.token = tokenData.access_token;
      req.session.user = { login: u.login, name: u.name || u.login, avatar: u.avatar_url };
      req.session.save(() => res.redirect('/repos'));
    });
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    fail('Login failed: could not reach GitHub.');
  }
});

router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('deploysync.sid'); res.redirect('/'); });
});

module.exports = router;
