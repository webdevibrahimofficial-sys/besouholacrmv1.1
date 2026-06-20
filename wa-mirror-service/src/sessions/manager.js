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

  return (
    message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
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

        fireWebhook(key, {
          event: 'message_received',
          message: {
            from: extractRemotePhone(msg.key.remoteJid),
            pushName: msg.pushName || null,
            body: extractMessageBody(msg.message),
            timestamp: msg.messageTimestamp,
            message_id: msg.key.id,
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
