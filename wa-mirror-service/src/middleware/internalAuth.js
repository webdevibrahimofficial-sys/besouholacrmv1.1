export function internalAuth(req, res, next) {
  const token = req.headers['x-internal-token'];

  if (!token || token !== process.env.INTERNAL_SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized internal access.' });
  }

  return next();
}
