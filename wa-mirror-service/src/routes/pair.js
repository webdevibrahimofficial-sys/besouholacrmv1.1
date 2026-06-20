import { Router } from 'express';
import QRCode from 'qrcode';
import { initSession, waitForSessionReady } from '../sessions/manager.js';

const router = Router();

router.post('/sessions/:tenantId/pair', async (req, res) => {
  const tenantId = req.params.tenantId;

  try {
    const sock = await initSession(tenantId);
    const result = await waitForSessionReady(sock, 10000);

    if (result.status === 'connected') {
      return res.json({ status: 'connected' });
    }

    if (result.qr) {
      const qrBase64 = await QRCode.toDataURL(result.qr);
      return res.json({
        status: 'pending_qr',
        qr: result.qr,
        qr_base64: qrBase64,
      });
    }

    return res.json({ status: result.status });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
