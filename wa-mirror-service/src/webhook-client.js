import axios from 'axios';

/**
 * Push session events and inbound messages to Laravel immediately.
 */
export async function notifyLaravel(tenantId, payload) {
  const url = process.env.LARAVEL_INTERNAL_URL;
  const token = process.env.INTERNAL_SHARED_SECRET;

  if (!url || !token) {
    console.error('[Webhook Error] LARAVEL_INTERNAL_URL or INTERNAL_SHARED_SECRET is missing.');
    return;
  }

  try {
    await axios.post(
      url,
      {
        tenant_id: tenantId,
        ...payload,
      },
      {
        headers: {
          'X-Internal-Token': token,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    );
  } catch (error) {
    console.error(`[Webhook Error] Tenant ${tenantId}:`, error.message);
  }
}
