import axios from 'axios';

const BASE_URL = process.env.LARAVEL_INTERNAL_URL;
const HISTORY_SYNC_URL = process.env.LARAVEL_INTERNAL_HISTORY_SYNC_URL || BASE_URL?.replace(/\/webhook$/, '/history-sync');
const TOKEN = process.env.INTERNAL_SHARED_SECRET;

function buildPayload(tenantId, payload) {
  return {
    tenant_id: tenantId,
    ...payload,
  };
}

function buildHeaders() {
  return {
    'X-Internal-Token': TOKEN,
    'Content-Type': 'application/json',
  };
}

async function post(url, tenantId, payload) {
  if (!url || !TOKEN) {
    console.error('[Webhook Error] LARAVEL_INTERNAL_URL or INTERNAL_SHARED_SECRET is missing.');
    return;
  }

  try {
    await axios.post(
      url,
      buildPayload(tenantId, payload),
      {
        headers: buildHeaders(),
        timeout: 8000,
      }
    );
    console.log('[Webhook OK] Tenant %s event=%s url=%s', tenantId, payload?.event || 'unknown', url);
  } catch (error) {
    console.error(`[Webhook Error] Tenant ${tenantId}:`, error.message);
  }
}

/**
 * Push session events and inbound/outbound messages to Laravel immediately.
 */
export async function notifyLaravel(tenantId, payload) {
  await post(BASE_URL, tenantId, payload);
}

/**
 * Push history-sync batches to Laravel.
 */
export async function notifyLaravelHistorySync(tenantId, payload) {
  await post(HISTORY_SYNC_URL, tenantId, payload);
}
