import { Router } from 'express';
import {
  getSession,
  getSessionDebug,
  initSession,
  registerLidPhoneMappings,
  waitForSessionReady,
} from '../sessions/manager.js';

const router = Router();

function formatWhatsAppJid(to) {
  const digits = String(to).replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

router.post('/sessions/:tenantId/send', async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { to, body } = req.body;

  if (!to || !body) {
    return res.status(422).json({
      error: 'Fields "to" and "body" are required.',
    });
  }

  try {
    let sock = getSession(tenantId);

    if (!sock) {
      console.log('[Send Init Session]', { tenantId });
      sock = await initSession(tenantId);
    }

    const ready = await waitForSessionReady(sock, 8000);

    console.log('[Send Request]', {
      tenantId,
      to,
      body,
      ready,
      debug: getSessionDebug(),
      hasSock: !!sock,
      status: sock?.connectionStatus || null,
    });

    if (ready.status !== 'connected' || sock.connectionStatus !== 'connected') {
      return res.status(400).json({
        error: 'WhatsApp session not connected.',
        tenantId,
        status: sock?.connectionStatus || ready.status,
        qr: ready.qr || sock.qrCode || null,
        debug: getSessionDebug(),
      });
    }

    const formattedTo = formatWhatsAppJid(to);

    console.log('[Send Debug]', {
      tenantId,
      to,
      formattedTo,
      body,
    });

    const exists = await sock.onWhatsApp(formattedTo);

    console.log('[onWhatsApp]', {
      tenantId,
      formattedTo,
      exists,
    });

    registerLidPhoneMappings(
      tenantId,
      (Array.isArray(exists) ? exists : []).map((entry) => ({
        lid: entry?.lid || null,
        phone: to,
      }))
    );

    const result = await sock.sendMessage(formattedTo, { text: body });

    console.log('[Sent Result]', {
      tenantId,
      id: result?.key?.id,
      remoteJid: result?.key?.remoteJid,
      fromMe: result?.key?.fromMe,
    });

    return res.json({
      success: true,
      messageId: result.key.id,
      remoteJid: result.key.remoteJid,
    });
  } catch (error) {
    console.error('[Send Error]', {
      tenantId,
      to,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ error: error.message });
  }
});

export default router;
