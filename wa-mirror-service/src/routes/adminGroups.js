import { Router } from 'express';
import { fetchAdminGroups, addParticipantToGroup, sendGroupInviteLink } from '../sessions/manager.js';

const router = Router();

router.get('/sessions/:tenantId/admin-groups', async (req, res) => {
  try {
    const groups = await fetchAdminGroups(req.params.tenantId);
    return res.json({ groups });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/sessions/:tenantId/groups/:groupJid/add-participant', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const result = await addParticipantToGroup(req.params.tenantId, req.params.groupJid, phone);
    return res.json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/sessions/:tenantId/groups/:groupJid/send-invite', async (req, res) => {
  try {
    const { phone, group_name: groupName } = req.body || {};
    const result = await sendGroupInviteLink(req.params.tenantId, req.params.groupJid, phone, groupName);
    return res.json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
