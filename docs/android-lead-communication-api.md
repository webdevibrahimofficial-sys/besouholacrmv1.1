# Lead Preview — Communication Tab API (Android Handoff)

API reference for the **Communication** tab in Lead Preview (WhatsApp + Email chat).  
Same endpoints used by the web Lead Details modal.

**Auth:** All routes require Sanctum (`Authorization: Bearer <token>`), except media URLs that carry a valid temporary signature.

**Base path:** `/api`

---

## Overview

| Feature | Method | Endpoint |
|---------|--------|----------|
| List WhatsApp messages | `GET` | `/api/v1/leads/{leadId}/whatsapp-messages` |
| WhatsApp capabilities | `GET` | `/api/v1/whatsapp/capabilities` |
| Send WhatsApp text | `POST` | `/api/v1/whatsapp/send-text` |
| Send WhatsApp media | `POST` | `/api/v1/whatsapp/send-media` |
| Send WhatsApp template | `POST` | `/api/v1/whatsapp/send-template` |
| WhatsApp templates list | `GET` | `/api/whatsapp-templates` |
| WhatsApp Mirror status (optional) | `GET` | `/api/whatsapp-mirror/status` |
| Stream WhatsApp media | `GET` | `/api/whatsapp/media/{messageId}` |
| List Email messages | `GET` | `/api/v1/leads/{leadId}/email-messages` |
| Send Email | `POST` | `/api/v1/email/send` |
| Email templates list (optional) | `GET` | `/api/email-templates` |

**Client filters (All / WhatsApp / Email):** There is no server-side channel query param. Fetch both lists and filter locally.

Empty history returns `[]` (UI shows “No messages”).

---

## WhatsApp

### 1. List lead WhatsApp messages

```http
GET /api/v1/leads/{leadId}/whatsapp-messages
```

Matches messages by `lead_id` and/or lead phone variants (`from` / `to`). Ordered ascending by `created_at`.

**Response:** `200` — JSON array

```json
[
  {
    "id": 123,
    "message_id": "wamid....",
    "body": "Hello",
    "direction": "inbound",
    "timestamp": "2026-08-20T15:00:00.000000Z",
    "status": "delivered",
    "type": "text",
    "channel_id": 1,
    "media": null,
    "attribution": null
  }
]
```

| Field | Notes |
|-------|--------|
| `direction` | `inbound` \| `outbound` |
| `status` | Normalized delivery status (e.g. `delivered`, `sent`, `failed`, `unstable`, …) |
| `type` | e.g. `text`, `image`, `video`, `audio`, `document`, `sticker` |
| `media` | `null` for text; see media object below |
| `attribution` | Ad/click attribution when present, else `null` |

**`media` object (when present):**

```json
{
  "url": "/api/whatsapp/media/123?expires=...&signature=...",
  "mime_type": "image/jpeg",
  "filename": "photo.jpg",
  "caption": "optional",
  "type": "image"
}
```

Resolve `media.url` against the API host. Prefer the returned signed URL; authenticated requests to `/api/whatsapp/media/{id}` are also accepted for the same tenant.

---

### 2. Capabilities

```http
GET /api/v1/whatsapp/capabilities
```

**Response:**

```json
{
  "provider": "meta",
  "media_supported": true,
  "templates_supported": true
}
```

| Field | Notes |
|-------|--------|
| `provider` | Active provider key (e.g. `meta`, `mirror`) |
| `media_supported` | `true` for `meta` and `mirror` |
| `templates_supported` | `true` only for `meta` |

Use this to enable/disable media and template UI.

---

### 3. Send text

```http
POST /api/v1/whatsapp/send-text
Content-Type: application/json
```

**Body:**

```json
{
  "recipient_number": "201555245876",
  "message_body": "Hello",
  "lead_id": 42,
  "channel_id": null
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `recipient_number` | yes | Digits preferred; backend normalizes |
| `message_body` | yes | |
| `lead_id` | no | Helps channel resolution / linking |
| `channel_id` | no | Optional outbound channel override |

**Response:** JSON with `ok` (boolean), `channel_id`, plus provider result fields.

---

### 4. Send media

```http
POST /api/v1/whatsapp/send-media
Content-Type: multipart/form-data
```

| Part | Required | Notes |
|------|----------|--------|
| `recipient_number` | yes | |
| `attachment` | yes | File, max 50MB |
| `caption` | no | Max 1024 chars |
| `lead_id` | no | |
| `channel_id` | no | |

Only when `media_supported` is true. Response shape similar to send-text (`ok`, `channel_id`, …).

---

### 5. Send template (Meta)

```http
POST /api/v1/whatsapp/send-template
Content-Type: application/json
```

```json
{
  "recipient_number": "201555245876",
  "template_name": "hello_world",
  "language": "en_US",
  "variables": [],
  "lead_id": 42,
  "channel_id": null
}
```

| Field | Required |
|-------|----------|
| `recipient_number` | yes |
| `template_name` | yes |
| `language` | no (default `en_US`) |
| `variables` | no (array) |
| `lead_id` | no |
| `channel_id` | no |

---

### 6. Templates list

```http
GET /api/whatsapp-templates
```

Standard API resource list used to populate the template picker.

---

### 7. Mirror status (optional)

```http
GET /api/whatsapp-mirror/status
```

Used by web to show Mirror/session connection state. Optional for Android if you only need message history + send.

---

## Email

### 1. List lead email messages

```http
GET /api/v1/leads/{leadId}/email-messages
```

Matches by `lead_id` and/or lead email (`from` / `to`). Ordered ascending by `created_at`.

**Response:** `200` — JSON array

```json
[
  {
    "id": 1,
    "subject": "Follow up",
    "body": "<p>Hello</p>",
    "direction": "outbound",
    "status": "delivered",
    "timestamp": "2026-08-20T15:00:00.000000Z"
  }
]
```

---

### 2. Send email

```http
POST /api/v1/email/send
Content-Type: application/json
```

```json
{
  "lead_id": 42,
  "recipient_email": "client@example.com",
  "subject": "Follow up",
  "body": "<p>Hello</p>"
}
```

| Field | Required |
|-------|----------|
| `recipient_email` | yes |
| `subject` | yes |
| `body` | yes |
| `lead_id` | no |

Sends via tenant SMTP / Gmail OAuth depending on SMTP settings.

---

### 3. Email templates (optional)

```http
GET /api/email-templates
```

---

## Realtime / polling (optional)

Web behavior when the Communication tab is open:

1. Prefer Echo on channel `tenant-{tenantId}-whatsapp`, event `InboundWhatsappMessage`, then reload WhatsApp messages for the open lead.
2. If Echo is unavailable, poll every **5 seconds**:
   - `GET /api/v1/leads/{leadId}/whatsapp-messages`
   - `GET /api/v1/leads/{leadId}/email-messages`

Android can mirror either approach.

---

## Implementation checklist

1. On Comm tab open for lead `{id}`: load WhatsApp messages + email messages in parallel.
2. Optionally load capabilities + templates.
3. Filter All / WhatsApp / Email on the client.
4. Send text/media/template/email with `lead_id` when available.
5. Prefetch or open `media.url` with auth or signed query params as returned.
6. Handle empty arrays as empty chat UI.

---

## Source references

- Routes: `api/routes/api.php` (WhatsApp v1 + Email Messages)
- Controllers: `WhatsappMessageController`, `EmailMessageController`
- Web clients: `frontend/src/services/whatsappService.js`, `frontend/src/services/emailService.js`
- UI: `frontend/src/shared/components/EnhancedLeadDetailsModal.jsx` (Communication tab)
