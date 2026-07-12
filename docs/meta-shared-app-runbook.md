# Meta Shared App Runbook

Operational guide for the shared Meta (Facebook) application integration after migration from per-tenant apps.

## Architecture Summary

- **One Meta App** configured in Super Admin → System Integrations
- **One global webhook**: `{API_URL}/api/meta/webhook`
- **Tenant routing** by `page_id` in webhook payloads
- **Tenant OAuth** links Facebook accounts and syncs pages/ad accounts
- **Data deletion** callback: `POST /api/facebook/data-deletion`
- **Deletion status page**: `{FRONTEND_URL}/privacy/data-deletion?code={confirmation_code}`

## Meta Developer Console Checklist

1. Open [Meta Developers](https://developers.facebook.com/apps/) and select the shared app.
2. **Facebook Login** → Valid OAuth Redirect URIs:
   - `{API_URL}/api/auth/meta/callback`
3. **Webhooks** → Page subscription:
   - Callback URL: `{API_URL}/api/meta/webhook`
   - Verify Token: same value as Super Admin `meta_verify_token`
   - Subscribe to `leadgen`
4. **App Review** (if required):
   - Data Deletion Callback URL: `{API_URL}/api/facebook/data-deletion`
   - Data Deletion Status URL: `{FRONTEND_URL}/privacy/data-deletion`
5. Ensure app has permissions: `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `ads_read`, `business_management`.

## Deployment Commands

```bash
php artisan migrate
php artisan meta:invalidate-connections
php artisan settings:encrypt-secrets   # optional: migrate legacy plaintext Google secrets
php artisan test --filter="Meta|SharedMeta|GoogleSecret"
```

## Post-Deploy Tenant Reconnect Flow

1. Run `meta:invalidate-connections` to mark all connections `needs_reauth=true`.
2. Tenant admins receive in-app + email notification to reconnect.
3. Each tenant opens **Marketing → Meta Integration** and clicks **Add New Account**.
4. After OAuth, `syncAssets` runs and **auto-subscribes** active pages to `leadgen` webhook.
5. Super Admin verifies webhook: **System Integrations → Verify Webhook**.

## Health & Monitoring

### Super Admin endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/super-admin/meta/health` | Global metrics (tenants, pages, conflicts, rate limits) |
| `POST /api/super-admin/meta/test-webhook` | Verify token challenge test |

### Tenant endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/auth/meta/status` | Connection status + `sync_warnings` |
| `GET /api/auth/meta/health` | Tenant-scoped diagnostics |

### Key metrics

- `page_conflicts` — same `page_id` linked to multiple tenants (blocked by design)
- `connections_needing_reauth` — tenants that must reconnect OAuth
- `rate_limit_events_24h` — Meta API rate limit counter (codes 4/17/32/613)
- `subscribe_summary` — webhook auto-subscribe results per sync

## Troubleshooting Leads

```mermaid
flowchart LR
    A[Lead not arriving] --> B{Webhook verified?}
    B -->|No| C[Fix verify token + URL in Meta Console]
    B -->|Yes| D{Page active in CRM?}
    D -->|No| E[Toggle page active / reconnect OAuth]
    D -->|Yes| F{page_id maps to tenant?}
    F -->|No| G[Check page_conflicts + sync_warnings]
    F -->|Yes| H{needs_reauth?}
    H -->|Yes| I[Tenant must reconnect Facebook]
    H -->|No| J[Check queue worker + meta queue logs]
```

1. **Webhook not verified** — run Super Admin "Verify Webhook"; match token in Meta Console.
2. **Page not subscribed** — reconnect OAuth or run manual sync; check `subscribe_summary.failed`.
3. **Page conflict** — page owned by another tenant; only one tenant can receive leads for a `page_id`.
4. **Expired token** — `needs_reauth=true`; tenant reconnects via Meta Integration UI.
5. **Queue issues** — ensure `meta` queue worker is running (`ProcessMetaLead`, `SyncMetaAssets`).

## Data Deletion (App Review)

- Meta sends `signed_request` to `POST /api/facebook/data-deletion`
- System deletes connections, pages, ad accounts for the Facebook user
- Returns status URL with `confirmation_code`
- Public status: `GET /api/facebook/data-deletion/status?code=...`

## Security Notes

- `meta_app_secret` and `google_client_secret` stored encrypted in `system_settings`
- Masked values (`**`) in API responses are not re-saved on update
- CAPI test endpoint (`POST /api/meta/capi/test`) is for diagnostics only

## Rollback Considerations

- Do **not** rollback to per-tenant Meta apps without data migration plan
- If rollback needed: restore `tenant_meta_apps` migration + per-tenant webhook URLs from backup
- Minimum safe action: disable Meta app in Super Admin until tenants are notified
