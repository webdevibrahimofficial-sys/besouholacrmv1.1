import { Router } from 'express';
import axios from 'axios';
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

function resolveSendTarget(formattedTo, exists) {
  const firstMatch = Array.isArray(exists) ? exists.find((entry) => entry?.exists) : null;

  if (firstMatch?.lid) {
    return String(firstMatch.lid).trim();
  }

  if (firstMatch?.jid) {
    return String(firstMatch.jid).trim();
  }

  return formattedTo;
}

function normalizeMediaType(mediaType) {
  const normalized = String(mediaType || '').trim().toLowerCase();

  if (['image', 'video', 'audio', 'document'].includes(normalized)) {
    return normalized;
  }

  return 'document';
}

async function buildMediaPayload(mediaType, mediaUrl, caption, filename) {
  const response = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 30000,
  });

  const buffer = Buffer.from(response.data);
  const mimeType = String(response.headers['content-type'] || '').trim() || undefined;
  const normalizedType = normalizeMediaType(mediaType);

  if (normalizedType === 'image') {
    return {
      image: buffer,
      caption: caption || undefined,
      mimetype: mimeType,
    };
  }

  if (normalizedType === 'video') {
    return {
      video: buffer,
      caption: caption || undefined,
      mimetype: mimeType,
    };
  }

  if (normalizedType === 'audio') {
    return {
      audio: buffer,
      mimetype: mimeType,
      ptt: false,
    };
  }

  return {
    document: buffer,
    mimetype: mimeType,
    fileName: filename || 'attachment',
    caption: caption || undefined,
  };
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

    const sendTarget = resolveSendTarget(formattedTo, exists);

    registerLidPhoneMappings(
      tenantId,
      (Array.isArray(exists) ? exists : []).map((entry) => ({
        lid: entry?.lid || null,
        phone: to,
      }))
    );

    const result = await sock.sendMessage(sendTarget, { text: body });

    console.log('[Sent Result]', {
      tenantId,
      id: result?.key?.id,
      remoteJid: result?.key?.remoteJid,
      sendTarget,
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

router.post('/sessions/:tenantId/send-media', async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { to, mediaType, mediaUrl, caption, filename } = req.body || {};

  if (!to || !mediaUrl) {
    return res.status(422).json({
      error: 'Fields "to" and "mediaUrl" are required.',
    });
  }

  try {
    let sock = getSession(tenantId);

    if (!sock) {
      console.log('[Send Media Init Session]', { tenantId });
      sock = await initSession(tenantId);
    }

    const ready = await waitForSessionReady(sock, 8000);

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
    const exists = await sock.onWhatsApp(formattedTo);
    const sendTarget = resolveSendTarget(formattedTo, exists);

    registerLidPhoneMappings(
      tenantId,
      (Array.isArray(exists) ? exists : []).map((entry) => ({
        lid: entry?.lid || null,
        phone: to,
      }))
    );

    const payload = await buildMediaPayload(mediaType, mediaUrl, caption, filename);
    const result = await sock.sendMessage(sendTarget, payload);

    return res.json({
      success: true,
      messageId: result?.key?.id || null,
      remoteJid: result?.key?.remoteJid || sendTarget,
      mediaType: normalizeMediaType(mediaType),
    });
  } catch (error) {
    console.error('[Send Media Error]', {
      tenantId,
      to,
      mediaType,
      mediaUrl,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ error: error.message });
  }
});

export default router;
