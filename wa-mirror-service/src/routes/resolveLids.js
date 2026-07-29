import { Router } from 'express';
import { resolveLidsForTenant } from '../sessions/manager.js';

const router = Router();

/**
 * Best-effort backfill: resolve a batch of previously-stored LIDs to real
 * phone numbers using the tenant's connected/persisted WhatsApp session.
 * Called by Laravel's `whatsapp-mirror:backfill-lids` artisan command.
 *
 * Body: { lids: string[] }  -- each entry can be a bare LID digit string
 *                               (e.g. "120569026592815") or a full jid
 *                               (e.g. "120569026592815@lid").
 * Response: { resolved: { [lid]: realPhone } }  -- only entries that were
 *                               successfully resolved are included.
 */
router.post('/sessions/:tenantId/resolve-lids', async (req, res) => {
  try {
    const lids = Array.isArray(req.body?.lids) ? req.body.lids : [];
    const resolved = await resolveLidsForTenant(req.params.tenantId, lids);
    return res.json({ resolved });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
