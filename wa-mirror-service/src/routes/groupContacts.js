import { Router } from 'express';
import { fetchGroupContactsSnapshot, listAllGroups } from '../sessions/manager.js';

const router = Router();

router.post('/sessions/:tenantId/group-contacts/sync', async (req, res) => {
  try {
    const groupJids = Array.isArray(req.body?.group_jids) ? req.body.group_jids : [];
    const result = await fetchGroupContactsSnapshot(req.params.tenantId, groupJids);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/sessions/:tenantId/groups', async (req, res) => {
  try {
    const groups = await listAllGroups(req.params.tenantId);
    return res.json({ groups });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
