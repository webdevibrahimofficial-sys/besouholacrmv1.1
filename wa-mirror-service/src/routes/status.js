import { Router } from 'express';
import { getSession, hasPersistedSession, initSession } from '../sessions/manager.js';

const router = Router();

router.get('/sessions/:tenantId/status', async (req, res) => {
  const tenantId = req.params.tenantId;
  let sock = getSession(tenantId);

  if (!sock && hasPersistedSession(tenantId)) {
    try {
      sock = await initSession(tenantId);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (!sock) {
    return res.json({ status: 'disconnected', qr: null });
  }

  return res.json({
    status: sock.connectionStatus,
    qr: sock.qrCode,
  });
});

export default router;
