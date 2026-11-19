// Optional allow-list. ALLOWED_GITHUB_USERS="alice,bob" restricts sign-in; empty means any GitHub user.
function allowedUsers() {
  return (process.env.ALLOWED_GITHUB_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function isAllowed(login) {
  const list = allowedUsers();
  return list.length === 0 || list.includes(String(login).toLowerCase());
}
module.exports = { isAllowed };
