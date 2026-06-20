import { Router } from 'express';
import { getSession } from '../sessions/manager.js';

const router = Router();

function formatWhatsAppJid(to) {
  const digits = String(to).replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

router.post('/sessions/:tenantId/send', async (req, res) => {
  const sock = getSession(req.params.tenantId);
  const { to, body } = req.body;

  if (!to || !body) {
    return res.status(422).json({ error: 'Fields "to" and "body" are required.' });
  }

  if (!sock || sock.connectionStatus !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp session not connected.' });
  }

  try {
    const formattedTo = formatWhatsAppJid(to);
    const result = await sock.sendMessage(formattedTo, { text: body });

    return res.json({
      success: true,
      messageId: result.key.id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
