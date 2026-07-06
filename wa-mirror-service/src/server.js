import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { internalAuth } from './middleware/internalAuth.js';
import pairRoutes from './routes/pair.js';
import statusRoutes from './routes/status.js';
import sendRoutes from './routes/send.js';
import disconnectRoutes from './routes/disconnect.js';
import groupContactsRoutes from './routes/groupContacts.js';
import resolveLidsRoutes from './routes/resolveLids.js';
import { restorePersistedSessions } from './sessions/manager.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wa-mirror-service' });
});

app.use(internalAuth);

app.use(pairRoutes);
app.use(statusRoutes);
app.use(sendRoutes);
app.use(disconnectRoutes);
app.use(groupContactsRoutes);
app.use(resolveLidsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`WhatsApp Mirror Service running on port ${PORT}`);
  restorePersistedSessions().catch((error) => {
    console.error('[Session Restore Fatal]', error.message);
  });
});
