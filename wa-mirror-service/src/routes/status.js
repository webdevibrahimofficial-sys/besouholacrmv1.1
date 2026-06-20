import { Router } from 'express';
import { getSession } from '../sessions/manager.js';

const router = Router();

router.get('/sessions/:tenantId/status', (req, res) => {
  const sock = getSession(req.params.tenantId);

  if (!sock) {
    return res.json({ status: 'disconnected', qr: null });
  }

  return res.json({
    status: sock.connectionStatus,
    qr: sock.qrCode,
  });
});

export default router;
