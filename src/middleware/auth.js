// Blocks API requests from users who are not logged in.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please sign in' });
  }
  next();
}

module.exports = { requireAuth };
