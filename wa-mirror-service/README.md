# WhatsApp Mirror Microservice

Node.js service that bridges Be Souhola CRM with WhatsApp via Baileys (unofficial mirror mode).

## Quick start

```bash
cd wa-mirror-service
cp .env.example .env
npm install
npm start
```

## PM2 (production)

```bash
npm install
npx pm2 start ecosystem.config.js
npx pm2 save
```

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `3000`) |
| `INTERNAL_SHARED_SECRET` | Shared token for Laravel ↔ Node calls |
| `LARAVEL_INTERNAL_URL` | Laravel webhook URL for inbound events |

## Endpoints

All routes except `GET /health` require header:

`X-Internal-Token: <INTERNAL_SHARED_SECRET>`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| POST | `/sessions/:tenantId/pair` | Start pairing, returns QR |
| GET | `/sessions/:tenantId/status` | Session status (+ QR if pending) |
| POST | `/sessions/:tenantId/send` | Send free-text message `{ to, body }` |
| DELETE | `/sessions/:tenantId` | Logout and wipe session files |

## Postman test

```http
POST http://localhost:3000/sessions/1/pair
X-Internal-Token: your_super_secure_shared_secret_here
```

Expected response:

```json
{
  "status": "pending_qr",
  "qr": "...",
  "qr_base64": "data:image/png;base64,..."
}
```

Session credentials are stored under `src/auth-state/session-{tenantId}/` (gitignored).
