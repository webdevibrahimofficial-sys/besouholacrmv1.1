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

function contactMapFileForTenant(tenantId) {
  return path.join(authDirForTenant(tenantId), 'contact-map.json');
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

function fireWebhook(tenantId, payload) {
  notifyLaravel(tenantId, payload).catch((error) => {
    console.error(`[Webhook Error] Tenant ${tenantId}:`, error.message);
  });
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
    sock.qrCode = null;
    sock.connectionStatus = 'disconnected';
    sock.lidToPhoneMap = loadPersistedLidPhoneMap(key);
    sock.contactNameMap = loadPersistedContactNameMap(key);

    sessions.set(key, sock);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('contacts.upsert', (contacts = []) => {
      for (const contact of contacts) {
        rememberContactName(sock, contact);
      }
    });
    sock.ev.on('contacts.update', (contacts = []) => {
      for (const contact of contacts) {
        rememberContactName(sock, contact);
      }
    });

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

        const isRestartRequired = statusCode === DisconnectReason.restartRequired
          || statusCode === 515;

        sock.connectionStatus = 'disconnected';
        fireWebhook(key, { event: 'status_change', status: 'disconnected' });

        const reconnectDelay = isRestartRequired ? 1500 : 5000;
        console.log(`[Reconnect] Tenant ${key} reconnecting in ${reconnectDelay}ms (statusCode=${statusCode})`);

        setTimeout(() => {
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
            timestamp: msg.messageTimestamp,
            message_id: msg.key.id,
            sender_pn: msg.key?.senderPn || null,
            participant_pn: msg.key?.participantPn || null,
            participant: extractRemotePhone(msg.key?.participant) || null,
            remote_jid: msg.key?.remoteJid || null,
            sender: extractRemotePhone(msg.key?.sender) || null,
            author: extractRemotePhone(msg.key?.participant) || extractRemotePhone(msg?.participant) || null,
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

export async function fetchGroupContactsSnapshot(tenantId) {
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

  for (const group of Object.values(allGroups || {})) {
    const groupJid = normalizeJid(group?.id);
    const groupName = group?.subject || null;
    const participants = Array.isArray(group?.participants) ? group.participants : [];

    for (const participant of participants) {
      const participantJid = normalizeJid(participant?.id);
      const mappedPhone = resolveMappedPhone(sock, participantJid);
      const directPhone = chooseBestPhoneCandidate([
        participant?.phone,
      ]);
      const lid = participantJid?.endsWith('@lid') ? normalizeLid(participantJid) : null;
      const resolvedPhone = mappedPhone || directPhone || null;
      const phone = resolvedPhone
        || chooseBestPhoneCandidate([
          participant?.phone,
          participantJid,
        ]);
      const isUnresolvedLid = Boolean(lid && !resolvedPhone);

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

  return {
    groups_count: Object.keys(allGroups || {}).length,
    contacts,
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
