import { Router } from 'express';
import QRCode from 'qrcode';
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

  const inferredStatus = (!sock.qrCode && sock.connectionStatus === 'disconnected' && hasPersistedSession(tenantId))
    ? 'reconnecting'
    : sock.connectionStatus;

  // The raw `qr` string alone isn't enough for the frontend to render an
  // image, and Baileys refreshes it every ~20-30s while waiting to be
  // scanned. Without generating qr_base64 here too (like /pair already
  // does), the browser only ever sees the QR from the initial /pair call
  // and keeps showing that stale, already-expired code forever.
  let qrBase64 = null;
  if (inferredStatus === 'pending_qr' && sock.qrCode) {
    try {
      qrBase64 = await QRCode.toDataURL(sock.qrCode);
    } catch (error) {
      console.error(`[QR Encode Error] Tenant ${tenantId}:`, error.message);
    }
  }

  return res.json({
    status: inferredStatus,
    qr: sock.qrCode,
    qr_base64: qrBase64,
    reconnect_reason: sock.reconnectReason || null,
    reconnect_detail: sock.reconnectDetail || null,
  });
});

export default router;
