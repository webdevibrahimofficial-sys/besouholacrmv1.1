import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { notifyLaravel, notifyLaravelHistorySync } from '../webhook-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authBaseDir = path.resolve(process.env.WA_AUTH_PATH || path.join(__dirname, '../auth-state'));

const sessions = new Map();
const initializing = new Map();

function authDirForTenant(tenantId) {
  return path.join(authBaseDir, `session-${tenantId}`);
}

function lidMapFileForTenant(tenantId) {
  return path.join(authDirForTenant(tenantId), 'lid-map.json');
}

function persistedSessionDirs() {
  if (!fs.existsSync(authBaseDir)) {
    return [];
  }
  return fs.readdirSync(authBaseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('session-'))
    .map((entry) => entry.name);
}

export function hasPersistedSession(tenantId) {
  return fs.existsSync(authDirForTenant(String(tenantId)));
}

function extractPhoneNumber(sock) {
  const userId = sock?.user?.id;
  if (!userId) return null;
  return userId.split(':')[0].split('@')[0];
}

function normalizeLid(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const userPart = raw.split('@')[0]?.split(':')[0]?.trim() || '';
  const digits = userPart.replace(/\D+/g, '');
  if (!digits) return null;
  return digits;
}

function extractMessageBody(message) {
  if (!message) return '';

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

  if (directText) return directText;

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

function summarizeConnectionUpdate(update = {}) {
  return {
    connection: update.connection || null,
    hasQr: !!update.qr,
    lastDisconnectStatusCode: update.lastDisconnect?.error?.output?.statusCode ?? null,
    lastDisconnectMessage: update.lastDisconnect?.error?.message ?? null,
  };
}

function mapReceiptStatus(rawStatus) {
  if (rawStatus === null || rawStatus === undefined) return null;

  if (typeof rawStatus === 'string') {
    const normalized = rawStatus.trim().toLowerCase();
    if (['delivery_ack', 'delivered', 'received'].includes(normalized)) return 'delivered';
    if (['read', 'read_ack', 'played', 'played_ack'].includes(normalized)) return 'read';
    if (['error', 'failed'].includes(normalized)) return 'failed';
    if (['server_ack', 'sent', 'pending'].includes(normalized)) return 'sent_to_session';
    return normalized;
  }

  if (typeof rawStatus === 'number') {
    if (rawStatus >= 3) return 'read';
    if (rawStatus === 2) return 'delivered';
    if (rawStatus === 0 || rawStatus === 1) return 'sent_to_session';
  }

  return null;
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
  if (!remoteJid) return null;
  return remoteJid.split('@')[0].split(':')[0];
}

function normalizePhoneCandidate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const userPart = raw.split('@')[0]?.split(':')[0]?.trim() || '';
  const digits = userPart.replace(/\D+/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function chooseBestPhoneCandidate(candidates) {
  const normalized = candidates
    .map((candidate) => normalizePhoneCandidate(candidate))
    .filter(Boolean);
  if (normalized.length === 0) return null;
  const nonLidSized = normalized.find((candidate) => candidate.length <= 15);
  return nonLidSized || normalized[0];
}

function rememberLidPhoneMapping(sock, lid, phone) {
  const normalizedLid = normalizeLid(lid);
  const normalizedPhone = normalizePhoneCandidate(phone);
  if (!normalizedLid || !normalizedPhone) return;
  if (!sock.lidToPhoneMap) sock.lidToPhoneMap = new Map();
  sock.lidToPhoneMap.set(normalizedLid, normalizedPhone);
  persistLidPhoneMap(sock);
}

function resolveMappedPhone(sock, candidate) {
  const normalized = normalizePhoneCandidate(candidate) || normalizeLid(candidate);
  if (!normalized || !sock?.lidToPhoneMap) return null;
  return sock.lidToPhoneMap.get(normalized) || null;
}

function loadPersistedLidPhoneMap(tenantId) {
  const file = lidMapFileForTenant(String(tenantId));
  if (!fs.existsSync(file)) return new Map();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return new Map(Object.entries(data || {}));
  } catch (error) {
    console.error(`[LID Map Load Error] Tenant ${tenantId}:`, error.message);
    return new Map();
  }
}

function persistLidPhoneMap(sock) {
  try {
    const file = lidMapFileForTenant(String(sock?.tenantId || ''));
    const data = Object.fromEntries(sock?.lidToPhoneMap || []);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`[LID Map Save Error] Tenant ${sock?.tenantId || 'unknown'}:`, error.message);
  }
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

  if (sessions.has(key)) return sessions.get(key);
  if (initializing.has(key)) return initializing.get(key);

  const initPromise = (async () => {
    const authDir = authDirForTenant(key);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    console.log(`[Session Init] Tenant ${key}`, {
      authDir,
      registered: !!state?.creds?.registered,
      meId: state?.creds?.me?.id || null,
    });

    const version = await resolveBaileysVersion();

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      syncFullHistory: true,
      markOnlineOnConnect: false,
    });

    sock.tenantId = key;
    sock.qrCode = null;
    sock.connectionStatus = 'disconnected';
    sock.lidToPhoneMap = loadPersistedLidPhoneMap(key);

    sessions.set(key, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`[Connection Update] Tenant ${key}`, summarizeConnectionUpdate(update));

      if (qr) {
        sock.qrCode = qr;
        sock.connectionStatus = 'pending_qr';
        fireWebhook(key, { event: 'status_change', status: 'pending_qr' });
      }

      if (connection === 'open') {
        sock.qrCode = null;
        sock.connectionStatus = 'connected';
        console.log(`[Session Open] Tenant ${key}`, {
          user: sock.user || null,
          connectedPhoneNumber: extractPhoneNumber(sock),
        });
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

        console.log(`[Connection Close] Tenant ${key}`, {
          statusCode,
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

        const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
        sock.connectionStatus = 'disconnected';
        fireWebhook(key, { event: 'status_change', status: 'disconnected' });

        const reconnectDelay = isRestartRequired ? 1500 : 5000;
        console.log(`[Reconnect] Tenant ${key} in ${reconnectDelay}ms (statusCode=${statusCode})`);

        setTimeout(() => {
          initSession(key).catch((error) => {
            console.error(`[Reconnect Error] Tenant ${key}:`, error.message);
          });
        }, reconnectDelay);
      }
    });

    // ─── History Sync ───────────────────────────────────────────────────────────
    sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
      if (!messages || messages.length === 0) return;

      const relevantMessages = messages
        .filter((m) => {
          if (!m.message) return false;
          const jid = m.key?.remoteJid || '';
          // Skip groups, newsletters, broadcast, and status
          if (jid.endsWith('@g.us')) return false;
          if (jid.endsWith('@newsletter')) return false;
          if (jid === 'status@broadcast') return false;
          if (jid.endsWith('@broadcast')) return false;
          return true;
        })
        .map((m) => {
          // Prefer senderPn (real phone) over remoteJid which may be a LID
          const phone = chooseBestPhoneCandidate([
            m.key?.senderPn,
            m.key?.participantPn,
          ]) || (m.key?.remoteJid?.endsWith('@lid')
            ? resolveMappedPhone(sock, m.key.remoteJid)
            : extractRemotePhone(m.key?.remoteJid)
          ) || extractSenderPhone(m);

          return {
            from_me: !!m.key.fromMe,
            phone,
            push_name: m.pushName || null,
            body: extractMessageBody(m.message),
            timestamp: m.messageTimestamp,
            message_id: m.key.id,
          };
        })
        .filter((m) => m.phone && normalizePhoneCandidate(m.phone) !== null);

      if (relevantMessages.length === 0) return;

      console.log('[history-sync] tenant=%s batch=%d isLatest=%s', key, relevantMessages.length, isLatest);

      notifyLaravelHistorySync(key, {
        event: 'history_sync_batch',
        is_latest: !!isLatest,
        messages: relevantMessages,
      });
    });

    // ─── Live Messages ───────────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async (event) => {
      if (event.type !== 'notify' && event.type !== 'append') return;

      for (const msg of event.messages) {
        if (!msg.message) continue;

        const jid = msg.key?.remoteJid || '';
        if (jid.endsWith('@g.us')) continue;
        if (jid.endsWith('@newsletter')) continue;
        if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;

        const isFromMe = !!msg.key.fromMe;
        const extractedBody = extractMessageBody(msg.message);
        const remoteJidRaw = msg.key?.remoteJid || '';
        const isLid = remoteJidRaw.endsWith('@lid');

        // For outbound msgs the counterpart is remoteJid; detect LID and resolve.
        const directCandidate = isFromMe
          ? (isLid ? null : normalizePhoneCandidate(remoteJidRaw)) || extractSenderPhone(msg)
          : extractSenderPhone(msg);

        const mappedCandidate = resolveMappedPhone(sock, remoteJidRaw)
          || resolveMappedPhone(sock, msg.key?.senderPn)
          || resolveMappedPhone(sock, msg.key?.participantPn)
          || resolveMappedPhone(sock, msg.key?.participant)
          || resolveMappedPhone(sock, msg?.participant)
          || resolveMappedPhone(sock, directCandidate);

        const counterpartPhone = mappedCandidate || directCandidate;

        if (!extractedBody) {
          console.log('[Empty Body] Tenant %s message_id=%s keys=%o', key, msg.key?.id, Object.keys(msg.message || {}));
        }

        console.log('[Live Message] Tenant %s %o', key, {
          messageId: msg.key?.id || null,
          fromMe: isFromMe,
          counterpartPhone,
          remoteJid: msg.key?.remoteJid || null,
          pushName: msg.pushName || null,
          bodyPreview: extractedBody ? extractedBody.slice(0, 80) : '',
        });

        fireWebhook(key, {
          event: 'message_received',
          message: {
            from_me: isFromMe,
            counterpart_phone: counterpartPhone,
            from: counterpartPhone,
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

    // ─── Message Status Updates ──────────────────────────────────────────────────
    sock.ev.on('messages.update', async (updates = []) => {
      for (const item of updates) {
        const messageId = item?.key?.id;
        const status = mapReceiptStatus(item?.update?.status);
        if (!messageId || !status) continue;

        fireWebhook(key, {
          event: 'message_status_update',
          message_id: messageId,
          status,
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

export async function restorePersistedSessions() {
  const dirs = persistedSessionDirs();
  for (const dir of dirs) {
    const tenantId = dir.replace(/^session-/, '');
    if (!tenantId) continue;
    try {
      console.log(`[Session Restore] Bootstrapping tenant ${tenantId}`);
      await initSession(tenantId);
    } catch (error) {
      console.error(`[Session Restore Error] Tenant ${tenantId}:`, error.message);
    }
  }
}

export function getSession(tenantId) {
  return sessions.get(String(tenantId));
}

export function registerLidPhoneMappings(tenantId, pairs = []) {
  const sock = sessions.get(String(tenantId));
  if (!sock) return;
  for (const pair of pairs) {
    rememberLidPhoneMapping(sock, pair?.lid, pair?.phone);
  }
}

export function getSessionDebug() {
  return [...sessions.entries()].map(([id, sock]) => ({
    tenantId: id,
    status: sock?.connectionStatus || null,
    hasQr: !!sock?.qrCode,
    user: sock?.user?.id || null,
    lidMapSize: sock?.lidToPhoneMap?.size || 0,
  }));
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
      if (settled) return;
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
