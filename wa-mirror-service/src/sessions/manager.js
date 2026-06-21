import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { notifyLaravel } from '../webhook-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessions = new Map();
const initializing = new Map();

function authDirForTenant(tenantId) {
  return path.join(__dirname, '../auth-state', `session-${tenantId}`);
}

function extractPhoneNumber(sock) {
  const userId = sock?.user?.id;
  if (!userId) {
    return null;
  }

  return userId.split(':')[0].split('@')[0];
}

function extractMessageBody(message) {
  if (!message) {
    return '';
  }

  const directText = (
    message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title
    || message.listResponseMessage?.singleSelectReply?.selectedRowId
    || message.templateButtonReplyMessage?.selectedDisplayText
    || message.templateButtonReplyMessage?.selectedId
    || message.interactiveResponseMessage?.body?.text
    || message.reactionMessage?.text
    || ''
  );

  if (directText) {
    return directText;
  }

  return (
    extractMessageBody(message.ephemeralMessage?.message)
    || extractMessageBody(message.viewOnceMessage?.message)
    || extractMessageBody(message.viewOnceMessageV2?.message)
    || extractMessageBody(message.viewOnceMessageV2Extension?.message)
    || extractMessageBody(message.documentWithCaptionMessage?.message)
    || extractMessageBody(message.editedMessage?.message)
    || extractMessageBody(message.protocolMessage?.editedMessage)
    || ''
  );
}

function fireWebhook(tenantId, payload) {
  notifyLaravel(tenantId, payload).catch((error) => {
    console.error(`[Webhook Error] Tenant ${tenantId}:`, error.message);
  });
}

async function resolveBaileysVersion() {
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);

    return result?.version;
  } catch (error) {
    console.error('[Baileys Version Error]', error.message);
    return undefined;
  }
}

function extractRemotePhone(remoteJid) {
  if (!remoteJid) {
    return null;
  }

  return remoteJid.split('@')[0].split(':')[0];
}

function normalizePhoneCandidate(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const userPart = raw.split('@')[0]?.split(':')[0]?.trim() || '';
  const digits = userPart.replace(/\D+/g, '');

  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return digits;
}

function chooseBestPhoneCandidate(candidates) {
  const normalized = candidates
    .map((candidate) => normalizePhoneCandidate(candidate))
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  const nonLidSized = normalized.find((candidate) => candidate.length <= 15);
  return nonLidSized || normalized[0];
}

function extractSenderPhone(msg) {
  const key = msg?.key || {};

  return chooseBestPhoneCandidate([
    key.senderPn,
    key.participantPn,
    key.participant,
    msg?.participant,
    key.remoteJid,
  ]);
}

/**
 * Start or restore a tenant Baileys session.
 */
export async function initSession(tenantId) {
  const key = String(tenantId);

  if (sessions.has(key)) {
    return sessions.get(key);
  }

  if (initializing.has(key)) {
    return initializing.get(key);
  }

  const initPromise = (async () => {
    const authDir = authDirForTenant(key);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const version = await resolveBaileysVersion();

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.tenantId = key;
    sock.qrCode = null;
    sock.connectionStatus = 'disconnected';

    sessions.set(key, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sock.qrCode = qr;
        sock.connectionStatus = 'pending_qr';
        fireWebhook(key, { event: 'status_change', status: 'pending_qr' });
      }

      if (connection === 'open') {
        sock.qrCode = null;
        sock.connectionStatus = 'connected';
        fireWebhook(key, {
          event: 'status_change',
          status: 'connected',
          connected_phone_number: extractPhoneNumber(sock),
        });
      }

      if (connection === 'close') {
        sock.qrCode = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !loggedOut;

        console.log(`[Connection Close] Tenant ${key}`, {
          statusCode,
          shouldReconnect,
          message: lastDisconnect?.error?.message,
        });

        sessions.delete(key);

        if (loggedOut) {
          sock.connectionStatus = 'disconnected';
          fireWebhook(key, { event: 'status_change', status: 'disconnected' });

          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }

          return;
        }

        sock.connectionStatus = statusCode === DisconnectReason.restartRequired
          ? 'pending_qr'
          : 'disconnected';
        fireWebhook(key, { event: 'status_change', status: sock.connectionStatus });

        setTimeout(() => {
          initSession(key).catch((error) => {
            console.error(`[Reconnect Error] Tenant ${key}:`, error.message);
          });
        }, statusCode === DisconnectReason.restartRequired ? 0 : 3000);
      }
    });

    sock.ev.on('messages.upsert', async (event) => {
      if (event.type !== 'notify') {
        return;
      }

      for (const msg of event.messages) {
        if (msg.key.fromMe) {
          continue;
        }

        const extractedBody = extractMessageBody(msg.message);

        if (!extractedBody) {
          // Diagnostic: log the top-level message-type keys (not the full content,
          // to avoid dumping media buffers/large payloads into logs) whenever we
          // fail to extract text, so we can see exactly which WhatsApp message
          // type extractMessageBody() doesn't handle yet.
          console.log(
            `[Empty Body] Tenant ${key} message_id=${msg.key?.id} keys=`,
            Object.keys(msg.message || {})
          );
        }

        fireWebhook(key, {
          event: 'message_received',
          message: {
            from: extractSenderPhone(msg),
            pushName: msg.pushName || null,
            body: extractedBody,
            timestamp: msg.messageTimestamp,
            message_id: msg.key.id,
            sender_pn: msg.key?.senderPn || null,
            participant_pn: msg.key?.participantPn || null,
            participant: extractRemotePhone(msg.key?.participant) || null,
            remote_jid: msg.key?.remoteJid || null,
          },
        });
      }
    });

    return sock;
  })();

  initializing.set(key, initPromise);

  try {
    return await initPromise;
  } finally {
    initializing.delete(key);
  }
}

export function getSession(tenantId) {
  return sessions.get(String(tenantId));
}

export async function deleteSession(tenantId) {
  const key = String(tenantId);
  const sock = sessions.get(key);

  if (sock) {
    try {
      await sock.logout();
    } catch (error) {
      console.error(`[Logout Error] Tenant ${key}:`, error.message);
    }

    sessions.delete(key);
  }

  const authDir = authDirForTenant(key);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
}

/**
 * Wait until QR is generated, session connects, or timeout is reached.
 */
export function waitForSessionReady(sock, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (sock.connectionStatus === 'connected') {
      resolve({ status: 'connected', qr: null });
      return;
    }

    if (sock.qrCode) {
      resolve({ status: 'pending_qr', qr: sock.qrCode });
      return;
    }

    let settled = false;

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      sock.ev.off('connection.update', onUpdate);
      resolve(payload);
    };

    const onUpdate = (update) => {
      if (update.connection === 'open') {
        finish({ status: 'connected', qr: null });
        return;
      }

      if (update.qr) {
        finish({ status: 'pending_qr', qr: update.qr });
      }
    };

    const timer = setTimeout(() => {
      finish({
        status: sock.connectionStatus || 'disconnected',
        qr: sock.qrCode || null,
      });
    }, timeoutMs);

    sock.ev.on('connection.update', onUpdate);
  });
}
