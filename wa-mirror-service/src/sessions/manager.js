import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
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
const reconnectAttempts = new Map();

// After this many fast attempts we don't give up — we just slow down and
// keep retrying indefinitely, since the auth state is still valid. Giving up
// entirely used to set status to 'reconnect_failed', which made the next
// manual /pair call wipe perfectly good credentials and force a fresh QR.
const MAX_FAST_RECONNECT_ATTEMPTS = 5;
const SLOW_RECONNECT_DELAY_MS = 30000;

function authDirForTenant(tenantId) {
  return path.join(authBaseDir, `session-${tenantId}`);
}

function lidMapFileForTenant(tenantId) {
  return path.join(authDirForTenant(tenantId), 'lid-map.json');
}

function contactMapFileForTenant(tenantId) {
  return path.join(authDirForTenant(tenantId), 'contact-map.json');
}

function resetReconnectState(tenantId) {
  reconnectAttempts.delete(String(tenantId));
}

function incrementReconnectAttempts(tenantId) {
  const key = String(tenantId);
  const nextValue = (reconnectAttempts.get(key) || 0) + 1;
  reconnectAttempts.set(key, nextValue);
  return nextValue;
}

function setReconnectMeta(sock, reason = null, detail = null) {
  if (!sock) {
    return;
  }

  sock.reconnectReason = reason || null;
  sock.reconnectDetail = detail || null;
}

function summarizeDisconnect(statusCode, lastDisconnect) {
  const message = String(lastDisconnect?.error?.message || '').trim();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('stream errored')) {
    return {
      reason: 'stream_errored',
      detail: 'WhatsApp stream errored while the mirror session was active. The service will try to reconnect automatically.',
    };
  }

  if (lowerMessage.includes('conflict') || lowerMessage.includes('replaced')) {
    return {
      reason: 'session_conflict',
      detail: 'WhatsApp reported a session conflict. Another device or browser may have interrupted this session.',
    };
  }

  if (lowerMessage.includes('device removed') || lowerMessage.includes('logged out')) {
    return {
      reason: 'device_removed',
      detail: 'This linked WhatsApp device was removed or logged out from the phone. Pair again to restore the mirror.',
    };
  }

  if (lowerMessage.includes('multidevice mismatch')) {
    return {
      reason: 'multidevice_mismatch',
      detail: 'WhatsApp reported a multi-device mismatch for this session. Pair again to restore the mirror.',
    };
  }

  if (lowerMessage.includes('connection failure')) {
    return {
      reason: 'connection_failure',
      detail: 'WhatsApp connection failed unexpectedly. The service will keep trying to reconnect.',
    };
  }

  if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
    return {
      reason: 'restart_required',
      detail: 'WhatsApp requested a session restart. The service is trying to restore the session automatically.',
    };
  }

  return {
    reason: 'session_disconnected',
    detail: message || 'The WhatsApp Mirror session disconnected unexpectedly.',
  };
}

function shouldStopReconnect(sock, statusCode, lastDisconnect) {
  const message = String(lastDisconnect?.error?.message || '').toLowerCase();
  const hasConnectedBefore = !!sock?.hasEverConnected;

  if (!hasConnectedBefore && statusCode === 408 && message.includes('qr refs attempts ended')) {
    return {
      stop: true,
      reason: 'qr_expired_before_pairing',
      detail: 'QR pairing expired before the session connected. Waiting for a fresh pair request.',
    };
  }

  if (message.includes('bad mac') || message.includes('failed to decrypt')) {
    return {
      stop: true,
      reason: 'corrupted_auth_state',
      detail: 'Auth state looks corrupted (Bad MAC / decrypt failure). Waiting for disconnect + re-pair.',
    };
  }

  // Never give up permanently just because we've retried a few times — the
  // auth state is still valid, so we keep retrying forever, just slower
  // (see MAX_FAST_RECONNECT_ATTEMPTS / SLOW_RECONNECT_DELAY_MS below). Giving
  // up used to flip status to 'reconnect_failed', which made the next manual
  // /pair call wipe perfectly good credentials and force a fresh QR scan.
  return { stop: false, reason: null, detail: null };
}

function isConflictDisconnect(statusCode, lastDisconnect) {
  const message = String(lastDisconnect?.error?.message || '').toLowerCase();
  return statusCode === DisconnectReason.loggedOut
    && (message.includes('conflict') || message.includes('replaced'));
}

function isHardLoggedOutDisconnect(sock, statusCode, lastDisconnect) {
  if (statusCode !== DisconnectReason.loggedOut) {
    return false;
  }

  const message = String(lastDisconnect?.error?.message || '').toLowerCase();
  const authStillExists = hasPersistedSession(sock?.tenantId || '');
  const hasCreds = !!sock?.authState?.creds?.me?.id || !!sock?.user?.id;

  if (message.includes('conflict') || message.includes('connection failure') || message.includes('stream errored')) {
    return false;
  }

  if (message.includes('logged out') || message.includes('device removed') || message.includes('multidevice mismatch')) {
    return true;
  }

  // If credentials still exist locally, bias toward reconnecting instead of
  // deleting the tenant session on an ambiguous 401.
  if (authStillExists && hasCreds) {
    return false;
  }

  return true;
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

function canRestorePersistedCreds(state) {
  return !!state?.creds?.registered && !!state?.creds?.me?.id;
}

function extractPhoneNumber(sock) {
  const userId = sock?.user?.id;
  if (!userId) {
    return null;
  }

  return userId.split(':')[0].split('@')[0];
}

function normalizeLid(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const userPart = raw.split('@')[0]?.split(':')[0]?.trim() || '';
  const digits = userPart.replace(/\D+/g, '');

  if (!digits) {
    return null;
  }

  return digits;
}

function cleanContactName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function selectBestContactName(contact = {}) {
  return (
    cleanContactName(contact.name)
    || cleanContactName(contact.notify)
    || cleanContactName(contact.verifiedName)
    || null
  );
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

function unwrapMessageForMedia(message) {
  if (!message) {
    return null;
  }

  if (message.imageMessage) {
    return { type: 'image', payload: message.imageMessage };
  }

  if (message.videoMessage) {
    return { type: 'video', payload: message.videoMessage };
  }

  if (message.audioMessage) {
    return { type: 'audio', payload: message.audioMessage };
  }

  if (message.documentMessage) {
    return { type: 'document', payload: message.documentMessage };
  }

  if (message.stickerMessage) {
    return { type: 'sticker', payload: message.stickerMessage };
  }

  return (
    unwrapMessageForMedia(message.ephemeralMessage?.message)
    || unwrapMessageForMedia(message.viewOnceMessage?.message)
    || unwrapMessageForMedia(message.viewOnceMessageV2?.message)
    || unwrapMessageForMedia(message.viewOnceMessageV2Extension?.message)
    || unwrapMessageForMedia(message.documentWithCaptionMessage?.message)
    || unwrapMessageForMedia(message.editedMessage?.message)
    || unwrapMessageForMedia(message.protocolMessage?.editedMessage)
    || null
  );
}

function extensionFromMimeType(mimeType, mediaType) {
  const normalized = String(mimeType || '').toLowerCase().trim();

  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('pdf')) return 'pdf';

  if (mediaType === 'image') return 'jpg';
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return 'mp3';

  return 'bin';
}

async function bufferFromReadableStream(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function extractMediaForWebhook(message) {
  const mediaEntry = unwrapMessageForMedia(message);
  if (!mediaEntry?.payload) {
    return null;
  }

  const mimeType = String(mediaEntry.payload.mimetype || '').trim() || null;
  const caption = (
    mediaEntry.payload.caption
    || mediaEntry.payload.fileName
    || null
  );
  const fileName = mediaEntry.payload.fileName
    || `whatsapp-${mediaEntry.type}.${extensionFromMimeType(mimeType, mediaEntry.type)}`;

  try {
    const stream = await downloadContentFromMessage(mediaEntry.payload, mediaEntry.type);
    const buffer = await bufferFromReadableStream(stream);

    return {
      type: mediaEntry.type,
      mime_type: mimeType,
      caption,
      file_name: fileName,
      size_bytes: buffer.length,
      base64: buffer.toString('base64'),
    };
  } catch (error) {
    console.error('[Media Extract Error]', {
      message: error.message,
      type: mediaEntry.type,
      mimeType,
      fileName,
    });

    return {
      type: mediaEntry.type,
      mime_type: mimeType,
      caption,
      file_name: fileName,
      base64: null,
      download_error: error.message,
    };
  }
}

function fireWebhook(tenantId, payload) {
  notifyLaravel(tenantId, payload).catch((error) => {
    console.error(`[Webhook Error] Tenant ${tenantId}:`, error.message);
  });
}

/**
 * Forward raw contact observations (contacts.upsert / contacts.update) to
 * Laravel's persistent Contact Resolver Layer (whatsapp_contacts table), so
 * the CRM keeps a cache of jid/lid/phone/name independent of any single
 * group snapshot or this process's in-memory maps -- the same idea behind
 * how WhatsApp Web itself resolves and displays names/numbers.
 */
function pushContactsToContactStore(tenantId, sock, contacts = [], source = 'contacts.update') {
  const normalized = contacts
    .map((contact) => {
      const jid = normalizeJid(contact?.id || contact?.jid || null);
      const lid = normalizeLid(contact?.lid || (jid?.endsWith('@lid') ? jid : null));
      const phone = normalizePhoneCandidate(contact?.phone) || (jid && !jid.endsWith('@lid') && !jid.endsWith('@g.us') ? normalizePhoneCandidate(jid) : null);

      if (!lid && !phone && !jid) {
        return null;
      }

      return {
        jid,
        lid,
        phone,
        name: cleanContactName(contact?.name) || null,
        push_name: cleanContactName(contact?.notify) || null,
        verified_name: cleanContactName(contact?.verifiedName) || null,
        source,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return;
  }

  fireWebhook(tenantId, { event: 'contact_update', contacts: normalized });
}

function summarizeConnectionUpdate(update = {}) {
  return {
    connection: update.connection || null,
    hasQr: !!update.qr,
    isNewLogin: update.isNewLogin ?? null,
    receivedPendingNotifications: update.receivedPendingNotifications ?? null,
    lastDisconnectStatusCode: update.lastDisconnect?.error?.output?.statusCode ?? null,
    lastDisconnectMessage: update.lastDisconnect?.error?.message ?? null,
  };
}

function mapReceiptStatus(rawStatus) {
  if (rawStatus === null || rawStatus === undefined) {
    return null;
  }

  if (typeof rawStatus === 'string') {
    const normalized = rawStatus.trim().toLowerCase();
    if (['delivery_ack', 'delivered', 'received'].includes(normalized)) {
      return 'delivered';
    }

    if (['read', 'read_ack', 'played', 'played_ack'].includes(normalized)) {
      return 'read';
    }

    if (['error', 'failed'].includes(normalized)) {
      return 'failed';
    }

    if (['server_ack', 'sent', 'pending'].includes(normalized)) {
      return 'sent_to_session';
    }

    return normalized;
  }

  if (typeof rawStatus === 'number') {
    if (rawStatus >= 3) {
      return 'read';
    }

    if (rawStatus === 2) {
      return 'delivered';
    }

    if (rawStatus === 0 || rawStatus === 1) {
      return 'sent_to_session';
    }
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

function isLikelyLidLength(digits) {
  // Real E.164 numbers are typically 10-13 digits. WhatsApp LIDs
  // (pseudo user ids WhatsApp uses when the real number is hidden or
  // unavailable, e.g. due to privacy settings) are usually 14-16 digits.
  return typeof digits === 'string' && digits.length >= 14;
}

function chooseBestPhoneCandidate(candidates) {
  const normalized = candidates
    .map((candidate) => normalizePhoneCandidate(candidate))
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  // Prefer a candidate that doesn't look like a LID. The previous check here
  // was `candidate.length <= 15`, which is ALWAYS true at this point because
  // normalizePhoneCandidate() already rejects anything over 15 digits -- so it
  // never actually filtered out LIDs. This was the root cause of LIDs like
  // "120569026592815" being saved and displayed as if they were real phone
  // numbers (e.g. the جزارة انس unassigned contact).
  const realLooking = normalized.find((candidate) => !isLikelyLidLength(candidate));
  return realLooking || normalized[0];
}

function rememberLidPhoneMapping(sock, lid, phone) {
  const normalizedLid = normalizeLid(lid);
  const normalizedPhone = normalizePhoneCandidate(phone);

  if (!normalizedLid || !normalizedPhone) {
    return;
  }

  if (!sock.lidToPhoneMap) {
    sock.lidToPhoneMap = new Map();
  }

  sock.lidToPhoneMap.set(normalizedLid, normalizedPhone);
  console.log('[LID Map Remember] Tenant %s lid=%s phone=%s', sock?.tenantId || 'unknown', normalizedLid, normalizedPhone);
  persistLidPhoneMap(sock);
}

function resolveMappedPhone(sock, candidate) {
  const normalized = normalizePhoneCandidate(candidate) || normalizeLid(candidate);
  if (!normalized || !sock?.lidToPhoneMap) {
    return null;
  }

  return sock.lidToPhoneMap.get(normalized) || null;
}

async function tryResolveLidToRealPhone(sock, jidOrLid) {
  if (!sock || typeof sock.onWhatsApp !== 'function' || !jidOrLid) {
    return null;
  }

  try {
    const results = await sock.onWhatsApp(jidOrLid);
    const match = Array.isArray(results) ? results[0] : null;
    const candidate = match?.jid || match?.pn || null;
    const resolved = candidate ? normalizePhoneCandidate(candidate) : null;

    if (resolved && !isLikelyLidLength(resolved)) {
      return resolved;
    }

    return null;
  } catch (error) {
    console.error('[LID Resolve Error] tenant=%s jid=%s', sock?.tenantId || 'unknown', jidOrLid, error.message);
    return null;
  }
}

function loadPersistedContactNameMap(tenantId) {
  const file = contactMapFileForTenant(String(tenantId));

  if (!fs.existsSync(file)) {
    return new Map();
  }

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map(Object.entries(data || {}));
    console.log('[Contact Map Load] Tenant %s size=%d', tenantId, map.size);
    return map;
  } catch (error) {
    console.error(`[Contact Map Load Error] Tenant ${tenantId}:`, error.message);
    return new Map();
  }
}

function loadPersistedLidPhoneMap(tenantId) {
  const file = lidMapFileForTenant(String(tenantId));

  if (!fs.existsSync(file)) {
    return new Map();
  }

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map(Object.entries(data || {}));
    console.log('[LID Map Load] Tenant %s size=%d', tenantId, map.size);
    return map;
  } catch (error) {
    console.error(`[LID Map Load Error] Tenant ${tenantId}:`, error.message);
    return new Map();
  }
}

function persistContactNameMap(sock) {
  try {
    const file = contactMapFileForTenant(String(sock?.tenantId || ''));
    const data = Object.fromEntries(sock?.contactNameMap || []);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`[Contact Map Save Error] Tenant ${sock?.tenantId || 'unknown'}:`, error.message);
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

function buildContactLookupKeys(candidate) {
  if (!candidate) {
    return [];
  }

  const raw = String(candidate).trim();
  if (!raw) {
    return [];
  }

  const keys = new Set([`raw:${raw.toLowerCase()}`]);
  const normalizedPhone = normalizePhoneCandidate(raw);
  const normalizedLid = normalizeLid(raw);

  if (normalizedPhone) {
    keys.add(`phone:${normalizedPhone}`);
  }

  if (normalizedLid) {
    keys.add(`lid:${normalizedLid}`);
  }

  return [...keys];
}

function rememberContactName(sock, contact = {}) {
  const bestName = selectBestContactName(contact);
  if (!bestName) {
    return;
  }

  if (!sock.contactNameMap) {
    sock.contactNameMap = new Map();
  }

  const keys = new Set([
    ...buildContactLookupKeys(contact.id),
    ...buildContactLookupKeys(contact.jid),
    ...buildContactLookupKeys(contact.lid),
  ]);

  if (keys.size === 0) {
    return;
  }

  for (const key of keys) {
    sock.contactNameMap.set(key, bestName);
  }

  persistContactNameMap(sock);
}

function resolveContactName(sock, candidates = [], fallbackName = null) {
  const directName = cleanContactName(fallbackName);
  if (directName) {
    return directName;
  }

  if (!sock?.contactNameMap) {
    return null;
  }

  for (const candidate of candidates) {
    for (const key of buildContactLookupKeys(candidate)) {
      const name = cleanContactName(sock.contactNameMap.get(key));
      if (name) {
        return name;
      }
    }
  }

  return null;
}

function normalizeJid(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  return raw !== '' ? raw : null;
}

function buildSelfParticipantKeys(sock) {
  const keys = new Set();
  const ownJid = normalizeJid(sock?.user?.id);
  const ownLid = normalizeJid(sock?.user?.lid);
  const ownPhone = normalizePhoneCandidate(extractPhoneNumber(sock));

  if (ownJid) {
    keys.add(ownJid);
  }

  if (ownLid) {
    keys.add(ownLid);
  }

  if (ownPhone) {
    keys.add(`${ownPhone}@s.whatsapp.net`);
    keys.add(`${ownPhone}:1@s.whatsapp.net`);
  }

  return keys;
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
    sock.authState = state;
    sock.qrCode = null;
    sock.connectionStatus = canRestorePersistedCreds(state) ? 'reconnecting' : 'disconnected';
    sock.reconnectReason = null;
    sock.reconnectDetail = null;
    sock.hasEverConnected = false;
    sock.lidToPhoneMap = loadPersistedLidPhoneMap(key);
    sock.contactNameMap = loadPersistedContactNameMap(key);

    sessions.set(key, sock);

    if (sock.connectionStatus === 'reconnecting') {
      setReconnectMeta(sock, 'restoring_saved_session', 'The service is restoring the previously saved WhatsApp session.');
      console.log(`[Session Restore Pending] Tenant ${key}`, {
        meId: state?.creds?.me?.id || null,
      });
      fireWebhook(key, {
        event: 'status_change',
        status: 'reconnecting',
        reconnect_reason: sock.reconnectReason,
        reconnect_detail: sock.reconnectDetail,
      });
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('contacts.upsert', (contacts = []) => {
      for (const contact of contacts) {
        rememberContactName(sock, contact);
      }
      pushContactsToContactStore(key, sock, contacts, 'contacts.upsert');
    });
    sock.ev.on('contacts.update', (contacts = []) => {
      for (const contact of contacts) {
        rememberContactName(sock, contact);
      }
      pushContactsToContactStore(key, sock, contacts, 'contacts.update');
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`[Connection Update] Tenant ${key}`, summarizeConnectionUpdate(update));

      if (qr) {
        sock.qrCode = qr;
        sock.connectionStatus = 'pending_qr';
        setReconnectMeta(sock, null, null);
        fireWebhook(key, { event: 'status_change', status: 'pending_qr' });
      }

      if (connection === 'open') {
        sock.qrCode = null;
        sock.connectionStatus = 'connected';
        setReconnectMeta(sock, null, null);
        sock.hasEverConnected = true;
        resetReconnectState(key);
        console.log(`[Session Open] Tenant ${key}`, {
          user: sock.user || null,
          registered: !!state?.creds?.registered,
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
        const conflictDisconnect = isConflictDisconnect(statusCode, lastDisconnect);
        const loggedOut = isHardLoggedOutDisconnect(sock, statusCode, lastDisconnect);
        const shouldReconnect = !loggedOut;
        const disconnectMeta = summarizeDisconnect(statusCode, lastDisconnect);

        console.log(`[Connection Close] Tenant ${key}`, {
          statusCode,
          conflictDisconnect,
          shouldReconnect,
          message: lastDisconnect?.error?.message,
        });

        if (loggedOut) {
          sessions.delete(key);
          sock.connectionStatus = 'disconnected';
          setReconnectMeta(sock, disconnectMeta.reason, disconnectMeta.detail);
          resetReconnectState(key);
          fireWebhook(key, {
            event: 'status_change',
            status: 'disconnected',
            reconnect_reason: sock.reconnectReason,
            reconnect_detail: sock.reconnectDetail,
          });

          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }

          return;
        }

        const isRestartRequired = statusCode === DisconnectReason.restartRequired
          || statusCode === 515
          || conflictDisconnect;

        sock.connectionStatus = 'reconnecting';
        setReconnectMeta(sock, disconnectMeta.reason, disconnectMeta.detail);
        fireWebhook(key, {
          event: 'status_change',
          status: 'reconnecting',
          reconnect_reason: sock.reconnectReason,
          reconnect_detail: sock.reconnectDetail,
        });

        const attemptCount = incrementReconnectAttempts(key);
        const reconnectDecision = shouldStopReconnect(sock, statusCode, lastDisconnect);
        console.log(`[Reconnect Decision] Tenant ${key}`, {
          attemptCount,
          stop: reconnectDecision.stop,
          reason: reconnectDecision.reason,
          detail: reconnectDecision.detail,
        });

    if (reconnectDecision.stop) {
          sock.connectionStatus = reconnectDecision.reason === 'reconnect_limit_reached'
            ? 'reconnect_failed'
            : 'disconnected';
          setReconnectMeta(
            sock,
            reconnectDecision.reason || disconnectMeta.reason,
            reconnectDecision.detail || disconnectMeta.detail,
          );
          fireWebhook(key, {
            event: 'status_change',
            status: sock.connectionStatus,
            reconnect_reason: sock.reconnectReason,
            reconnect_detail: sock.reconnectDetail,
          });
          return;
        }

        const fastDelay = conflictDisconnect ? 1000 : (isRestartRequired ? 1500 : 5000);
        const reconnectDelay = attemptCount > MAX_FAST_RECONNECT_ATTEMPTS ? SLOW_RECONNECT_DELAY_MS : fastDelay;
        console.log(`[Reconnect] Tenant ${key} reconnecting in ${reconnectDelay}ms (statusCode=${statusCode}, attempt=${attemptCount})`);

        setTimeout(() => {
          sessions.delete(key);
          initSession(key).catch((error) => {
            console.error(`[Reconnect Error] Tenant ${key}:`, error.message);
          });
        }, reconnectDelay);
      }
    });

    sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
      if (!messages || messages.length === 0) return;

      const relevantMessages = messages
        .filter((m) => {
          if (!m.message) return false;
          const jid = m.key?.remoteJid || '';
          if (jid.endsWith('@g.us')) return false;
          if (jid.endsWith('@newsletter')) return false;
          if (jid === 'status@broadcast') return false;
          if (jid.endsWith('@broadcast')) return false;
          return true;
        })
        .map((m) => {
          const phone = chooseBestPhoneCandidate([
            m.key?.senderPn,
            m.key?.participantPn,
          ]) || (m.key?.remoteJid?.endsWith('@lid')
            ? resolveMappedPhone(sock, m.key.remoteJid)
            : extractRemotePhone(m.key?.remoteJid)
          ) || extractSenderPhone(m);

          const pushName = resolveContactName(sock, [
            m.key?.remoteJid,
            m.key?.participant,
            m?.participant,
            m.key?.senderPn,
            m.key?.participantPn,
            phone,
          ], m.pushName);

          return {
            from_me: !!m.key.fromMe,
            phone,
            is_unresolved_lid: isLikelyLidLength(phone),
            push_name: pushName,
            body: extractMessageBody(m.message),
            timestamp: m.messageTimestamp,
            message_id: m.key.id,
            sender_pn: m.key?.senderPn || null,
            participant_pn: m.key?.participantPn || null,
            participant: extractRemotePhone(m.key?.participant) || extractRemotePhone(m?.participant) || null,
            remote_jid: m.key?.remoteJid || null,
            sender: extractRemotePhone(m.key?.sender) || null,
            author: extractRemotePhone(m.key?.participant) || extractRemotePhone(m?.participant) || null,
          };
        })
        .filter((m) => m.phone && normalizePhoneCandidate(m.phone) !== null);

      if (relevantMessages.length === 0) return;

      const historyContacts = relevantMessages
        .map((message) => {
          const jid = normalizeJid(message.remote_jid);
          const lid = normalizeLid(
            (typeof message.remote_jid === 'string' && message.remote_jid.endsWith('@lid') && message.remote_jid)
            || (typeof message.participant === 'string' && `${message.participant}`.endsWith('@lid') && message.participant)
            || null
          );
          const phone = isLikelyLidLength(message.phone) ? null : normalizePhoneCandidate(message.phone);

          if (!jid && !lid && !phone) {
            return null;
          }

          return {
            jid,
            lid,
            phone,
            push_name: cleanContactName(message.push_name) || null,
            source: 'history_sync',
          };
        })
        .filter(Boolean);

      if (historyContacts.length > 0) {
        fireWebhook(key, { event: 'contact_update', contacts: historyContacts });
      }

      console.log('[history-sync] tenant=%s batch=%d isLatest=%s', key, relevantMessages.length, isLatest);

      notifyLaravelHistorySync(key, {
        event: 'history_sync_batch',
        is_latest: !!isLatest,
        messages: relevantMessages,
      });
    });

    sock.ev.on('messages.upsert', async (event) => {
      if (event.type !== 'notify' && event.type !== 'append') {
        return;
      }

      for (const msg of event.messages) {
        if (!msg.message) continue;
        if (msg.key.remoteJid?.endsWith('@g.us')) continue;

        const isFromMe = !!msg.key.fromMe;
        const extractedBody = extractMessageBody(msg.message);
        const mediaPayload = await extractMediaForWebhook(msg.message);
        // For outbound (fromMe) messages the counterpart is the remoteJid.
        // remoteJid can be a LID (e.g. "195893592608918@lid") instead of a real
        // E.164 number. Detect @lid and fall back to senderPn/participantPn.
        const remoteJidRaw = msg.key?.remoteJid || '';
        const isLid = remoteJidRaw.endsWith('@lid');
        const directCandidate = isFromMe
          ? (isLid ? null : normalizePhoneCandidate(remoteJidRaw)) || extractSenderPhone(msg)
          : extractSenderPhone(msg);

        const mappedCandidate = resolveMappedPhone(sock, remoteJidRaw)
          || resolveMappedPhone(sock, msg.key?.senderPn)
          || resolveMappedPhone(sock, msg.key?.participantPn)
          || resolveMappedPhone(sock, msg.key?.participant)
          || resolveMappedPhone(sock, msg?.participant)
          || resolveMappedPhone(sock, directCandidate);

        let counterpartPhone = mappedCandidate || directCandidate;
        let isUnresolvedLid = !mappedCandidate && isLikelyLidLength(counterpartPhone);

        if (isUnresolvedLid) {
          // Best-effort: ask WhatsApp directly for the real number behind this LID
          // instead of silently storing the LID as if it were the phone number.
          const resolvedFromLookup = await tryResolveLidToRealPhone(sock, remoteJidRaw || counterpartPhone);

          if (resolvedFromLookup) {
            rememberLidPhoneMapping(sock, remoteJidRaw || counterpartPhone, resolvedFromLookup);
            counterpartPhone = resolvedFromLookup;
            isUnresolvedLid = false;
          }
        }

        const resolvedPushName = resolveContactName(sock, [
          msg.key?.remoteJid,
          msg.key?.participant,
          msg?.participant,
          msg.key?.senderPn,
          msg.key?.participantPn,
          counterpartPhone,
        ], msg.pushName);

        if (!extractedBody) {
          console.log(
            '[Empty Body] Tenant %s message_id=%s keys=%o',
            key,
            msg.key?.id,
            Object.keys(msg.message || {})
          );
        }

        console.log('[Live Message] Tenant %s %o', key, {
          eventType: event.type,
          messageId: msg.key?.id || null,
          fromMe: isFromMe,
          counterpartPhone,
          isUnresolvedLid,
          remoteJid: msg.key?.remoteJid || null,
          pushName: resolvedPushName,
          bodyPreview: extractedBody ? extractedBody.slice(0, 80) : '',
          messageKeys: Object.keys(msg.message || {}),
        });

        fireWebhook(key, {
          event: 'message_received',
          message: {
            from_me: isFromMe,
            from: counterpartPhone,
            is_unresolved_lid: isUnresolvedLid,
            pushName: resolvedPushName,
            body: extractedBody,
            type: mediaPayload?.type || 'text',
            timestamp: msg.messageTimestamp,
            message_id: msg.key.id,
            sender_pn: msg.key?.senderPn || null,
            participant_pn: msg.key?.participantPn || null,
            participant: extractRemotePhone(msg.key?.participant) || null,
            remote_jid: msg.key?.remoteJid || null,
            sender: extractRemotePhone(msg.key?.sender) || null,
            author: extractRemotePhone(msg.key?.participant) || extractRemotePhone(msg?.participant) || null,
            media: mediaPayload,
          },
        });
      }
    });

    sock.ev.on('messages.update', async (updates = []) => {
      for (const item of updates) {
        const messageId = item?.key?.id;
        const status = mapReceiptStatus(item?.update?.status);

        if (!messageId || !status) {
          continue;
        }

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
    if (!tenantId) {
      continue;
    }

    try {
      console.log(`[Session Restore] Bootstrapping tenant ${tenantId} from ${dir}`);
      await initSession(tenantId);
    } catch (error) {
      console.error(`[Session Restore Error] Tenant ${tenantId}:`, error.message);
    }
  }
}

export function getSession(tenantId) {
  return sessions.get(String(tenantId));
}

export async function fetchGroupContactsSnapshot(tenantId, groupJids = []) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const allGroups = await sock.groupFetchAllParticipating();
  const ownPhone = normalizePhoneCandidate(extractPhoneNumber(sock));
  const contacts = [];

  const wantedGroupJids = Array.isArray(groupJids) && groupJids.length > 0
    ? new Set(groupJids.map((jid) => normalizeJid(jid)).filter(Boolean))
    : null;

  for (const group of Object.values(allGroups || {})) {
    const groupJid = normalizeJid(group?.id);

    if (wantedGroupJids && !wantedGroupJids.has(groupJid)) {
      continue;
    }

    const groupName = group?.subject || null;
    const participants = Array.isArray(group?.participants) ? group.participants : [];

    for (const participant of participants) {
      const participantJid = normalizeJid(participant?.id);

      // Baileys' GroupParticipant (see Contact type) exposes THREE distinct
      // identifiers, not a `.phone` field (which never existed and always
      // evaluated to undefined, silently breaking resolution for every
      // group member):
      //   - id:  the raw identifier used to address them (often @lid)
      //   - lid: the explicit anonymous @lid identifier
      //   - jid: the real @s.whatsapp.net phone-number identifier, present
      //          ONLY when WhatsApp's server actually reveals it (built from
      //          the `phone_number` attribute server-side; omitted entirely
      //          when the participant's privacy settings hide their number).
      const explicitLid = participant?.lid ? normalizeLid(participant.lid) : null;
      const isLidId = participantJid?.endsWith('@lid');
      const lid = explicitLid || (isLidId ? normalizeLid(participantJid) : null);

      const explicitPhoneJid = participant?.jid && !String(participant.jid).endsWith('@lid')
        ? participant.jid
        : null;

      const mappedPhone = resolveMappedPhone(sock, participantJid)
        || (lid ? resolveMappedPhone(sock, lid) : null);
      const directPhone = chooseBestPhoneCandidate([
        explicitPhoneJid,
        !isLidId ? participantJid : null,
      ]);
      const resolvedPhone = mappedPhone || directPhone || null;
      const isUnresolvedLid = Boolean(lid && !resolvedPhone);

      // Fall back to the lid digits only as a placeholder so unresolved rows
      // still get created (and can be resolved later); never treat this as a
      // real phone number downstream (is_unresolved_lid flags it).
      const phone = resolvedPhone || lid;

      if (!phone || phone === ownPhone) {
        continue;
      }

      contacts.push({
        group_jid: groupJid,
        group_name: groupName,
        participant_jid: participantJid,
        lid,
        phone,
        resolved_phone: resolvedPhone,
        is_unresolved_lid: isUnresolvedLid,
        push_name: resolveContactName(sock, [participantJid, phone], null),
      });
    }
  }

  const syncedGroupsCount = wantedGroupJids
    ? new Set(contacts.map((contact) => contact.group_jid)).size
    : Object.keys(allGroups || {}).length;

  return {
    groups_count: syncedGroupsCount,
    contacts,
  };
}

/**
 * List the groups (from the tenant's connected/persisted session) where the
 * linked account itself is an admin or superadmin -- used by the CRM UI to
 * offer a "which group should this contact be added to" picker.
 */
export async function fetchAdminGroups(tenantId) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const allGroups = await sock.groupFetchAllParticipating();
  const selfParticipantKeys = buildSelfParticipantKeys(sock);

  const groups = [];

  for (const group of Object.values(allGroups || {})) {
    const participants = Array.isArray(group?.participants) ? group.participants : [];

    // Match "self" among the participants. Depending on the group's
    // addressingMode, our own participant entry's `id` may be either our
    // real jid, an explicit `jid`, or our own @lid. Keep this tolerant
    // because WhatsApp/Baileys can expose different shapes per group.
    const self = participants.find((participant) => {
      const participantId = normalizeJid(participant?.id);
      const participantJid = normalizeJid(participant?.jid);
      return (
        (participantId && selfParticipantKeys.has(participantId))
        || (participantJid && selfParticipantKeys.has(participantJid))
      );
    });

    if (!self?.admin) {
      continue;
    }

    groups.push({
      id: normalizeJid(group?.id),
      name: group?.subject || null,
      size: group?.size ?? participants.length,
    });
  }

  return groups;
}

/**
 * List every group the tenant's linked account participates in (regardless
 * of admin status) -- used by the CRM UI's "choose which groups to sync"
 * multi-select picker.
 */
export async function listAllGroups(tenantId) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const allGroups = await sock.groupFetchAllParticipating();

  return Object.values(allGroups || {}).map((group) => {
    const participants = Array.isArray(group?.participants) ? group.participants : [];
    return {
      id: normalizeJid(group?.id),
      name: group?.subject || null,
      size: group?.size ?? participants.length,
    };
  });
}

/**
 * Add a phone number to an existing WhatsApp group. Requires the tenant's
 * linked account to be an admin of that group (WhatsApp itself enforces
 * this server-side; Baileys will surface a non-200 status per participant
 * in the response if it's rejected).
 */
export async function addParticipantToGroup(tenantId, groupJid, phone) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const normalizedGroupJid = normalizeJid(groupJid);
  if (!normalizedGroupJid || !normalizedGroupJid.endsWith('@g.us')) {
    throw new Error('A valid WhatsApp group id is required.');
  }

  const normalizedPhone = normalizePhoneCandidate(phone);
  if (!normalizedPhone) {
    throw new Error('A valid phone number is required to add a participant.');
  }

  const participantJid = `${normalizedPhone}@s.whatsapp.net`;
  let result;

  try {
    [result] = await sock.groupParticipantsUpdate(normalizedGroupJid, [participantJid], 'add');
  } catch (error) {
    error.sessionStatus = sock?.connectionStatus || 'disconnected';
    error.reconnectReason = sock?.reconnectReason || null;
    error.reconnectDetail = sock?.reconnectDetail || null;
    throw error;
  }

  return result || { status: 'unknown', jid: participantJid };
}

export async function sendGroupInviteLink(tenantId, groupJid, phone, groupName = null) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const normalizedGroupJid = normalizeJid(groupJid);
  if (!normalizedGroupJid || !normalizedGroupJid.endsWith('@g.us')) {
    throw new Error('A valid WhatsApp group id is required.');
  }

  const normalizedPhone = normalizePhoneCandidate(phone);
  if (!normalizedPhone) {
    throw new Error('A valid phone number is required to send an invite.');
  }

  const inviteCode = await sock.groupInviteCode(normalizedGroupJid);
  if (!inviteCode) {
    throw new Error('Unable to generate a WhatsApp invite link for this group.');
  }

  let resolvedGroupName = groupName || null;
  if (!resolvedGroupName) {
    try {
      const metadata = await sock.groupMetadata(normalizedGroupJid);
      resolvedGroupName = metadata?.subject || null;
    } catch (error) {
      resolvedGroupName = null;
    }
  }

  const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
  const participantJid = `${normalizedPhone}@s.whatsapp.net`;
  const inviteMessage = resolvedGroupName
    ? `Join ${resolvedGroupName}: ${inviteLink}`
    : `Join this WhatsApp group: ${inviteLink}`;

  const sendResult = await sock.sendMessage(participantJid, { text: inviteMessage });

  return {
    status: 200,
    jid: participantJid,
    invite_code: inviteCode,
    invite_link: inviteLink,
    message_id: sendResult?.key?.id || null,
    group_name: resolvedGroupName,
  };
}

export function registerLidPhoneMappings(tenantId, pairs = []) {
  const sock = sessions.get(String(tenantId));
  if (!sock) {
    return;
  }

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
    contactMapSize: sock?.contactNameMap?.size || 0,
  }));
}

/**
 * Best-effort resolve a batch of LIDs (or bare LID digit strings) to real
 * phone numbers using the tenant's active/persisted session. Used by the
 * Laravel backfill command for unassigned contacts that were stored with a
 * LID before the isLikelyLidLength() fix landed.
 */
export async function resolveLidsForTenant(tenantId, lids = []) {
  const key = String(tenantId);
  let sock = sessions.get(key);

  if (!sock && hasPersistedSession(key)) {
    sock = await initSession(key);
  }

  if (!sock) {
    throw new Error('WhatsApp Mirror session is not connected.');
  }

  const resolved = {};

  for (const rawLid of lids) {
    if (!rawLid) {
      continue;
    }

    const lidString = String(rawLid);
    const jid = lidString.includes('@') ? lidString : `${lidString}@lid`;

    // Already known from a previous mapping.
    const alreadyMapped = resolveMappedPhone(sock, jid);
    if (alreadyMapped) {
      resolved[lidString] = alreadyMapped;
      continue;
    }

    const phone = await tryResolveLidToRealPhone(sock, jid);
    if (phone) {
      rememberLidPhoneMapping(sock, jid, phone);
      resolved[lidString] = phone;
    }
  }

  return resolved;
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

  resetReconnectState(key);
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
