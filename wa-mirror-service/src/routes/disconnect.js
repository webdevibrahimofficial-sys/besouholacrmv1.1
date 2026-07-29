import { Router } from 'express';
import { deleteSession } from '../sessions/manager.js';

const router = Router();

router.delete('/sessions/:tenantId', async (req, res) => {
  try {
    await deleteSession(req.params.tenantId);
    return res.json({ success: true, message: 'Session deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
