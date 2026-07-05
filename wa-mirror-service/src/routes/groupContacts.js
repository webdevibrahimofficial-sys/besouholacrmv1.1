import { Router } from 'express';
import { fetchGroupContactsSnapshot } from '../sessions/manager.js';

const router = Router();

router.post('/sessions/:tenantId/group-contacts/sync', async (req, res) => {
  try {
    const result = await fetchGroupContactsSnapshot(req.params.tenantId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
