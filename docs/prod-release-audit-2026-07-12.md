# Production Release Audit

Date:

- `2026-07-12`

Production server:

- `root@72.60.89.184`

Live path:

- `/var/www/besouhola/monorepo`

## 1. Backup Taken First

Created before further inspection:

- `/var/www/besouhola/backups/monorepo_pre_deploy_audit_2026-07-12_.tar.gz`

Notes:

- backup completed successfully
- filename has an empty time suffix because the local shell expanded `$(date ...)` before SSH, but the archive itself was created correctly

## 2. Latest Observed Production Upload Time

High-confidence deployment markers found on the server:

- live app root mtime: `2026-07-06 16:13:26 +0000`
- live `index.html` mtime: `2026-07-06 16:13:26 +0000`
- backup artifact set:
  - `/var/www/besouhola/backups/20260706-1910/monorepo-api.tgz`
  - `/var/www/besouhola/backups/20260706-1910/monorepo-frontend.tgz`
  - `/var/www/besouhola/backups/20260706-191339/monorepo-api.tgz`
  - `/var/www/besouhola/backups/20260706-191339/monorepo-frontend.tgz`
  - `/var/www/besouhola/backups/20260706-191339/wa-mirror-service.tgz`

Interpreted production release window:

- `2026-07-06 19:10` to `2026-07-06 19:15` Cairo time

Important caveat:

- production is still not a git checkout
- no deployed commit marker file was found
- the baseline commit below is inferred from deployment timing, not proven from server git metadata

## 3. Baseline Used For Local Comparison

Closest local commit before the latest observed production upload:

- `146adf98` `feat: ship lead reassignment, stage validation, and whatsapp mirror fixes`
- commit time: `2026-07-06 19:06:53 +0300`

Working assumption for deployment prep:

- treat `146adf98` as the most likely production baseline
- treat everything in `146adf98..HEAD` as pending local work to prepare for production

## 4. Local Commits Since That Production Window

1. `173237f7` `Implement WhatsApp mirror recovery and group action flow`
2. `eba90600` `feat: checkpoint current system updates`
3. `65489d94` `Fix secure tenant support access flow`
4. `edef4a19` `feat(api): migrate meta integration to shared landlord context`
5. `8ef97eb3` `feat(frontend): update auth impersonation and meta integration flows`
6. `499f96a6` `chore: add rollout notes and tenant debug helpers`

## 5. High-Level Pending Change Groups

### A. WhatsApp Mirror and Group Handling

- mirror recovery and reconnect state handling
- group action and admin group routes
- incoming mirror processing and contact storage changes
- updates in `wa-mirror-service` and backend WhatsApp controllers/services/migrations

### B. Secure Support / Impersonation / Auth Flow

- stronger tenant support access flow
- impersonation session handling and protection middleware
- auth and routing updates in both backend and frontend

### C. Shared Meta App Migration

- migrate Meta integration from per-tenant app setup to shared landlord/system setup
- new shared secret handling and encryption commands
- new health, CAPI, webhook, and data-deletion endpoints
- landlord-side models and migrations
- Meta tenant reconnect and invalidation flows

### D. Admin Notifications and Backup Management

- admin notification payloads, settings, push subscriptions, jobs, and UI
- tenant/platform backup and restore backend support
- frontend backup management UI changes

### E. Frontend Admin / Leads / Projects / Reports

- login and forgot/reset password flow changes
- topbar/sidebar/app state updates
- leads, projects, properties, reservations report, cancel reasons
- system integrations and Meta settings UI

### F. Documentation and Debug Helpers

- `docs/meta-shared-app-runbook.md`
- `docs/pending-production-changes.md`
- temporary helper scripts in repo root for tenant/admin inspection

## 6. Deployment-Relevant Surface Area

Summary of diff from `146adf98..HEAD`:

- `278 files changed`
- `16754 insertions`
- `2586 deletions`

Main touched areas:

- `api/`
- `frontend/`
- `wa-mirror-service/`
- `docs/`

## 7. Sensitive Items To Review Before Upload

### Must review carefully

- all migrations under `api/database/migrations/`
- all landlord migrations under `api/database/migrations/landlord/`
- route changes in `api/routes/api.php`
- bootstrap/config changes in `api/bootstrap/app.php`, `api/config/*`
- any queue/job requirements for notifications, backups, Meta sync, and WhatsApp processing

### Potentially sensitive or non-production helpers

- `api/storage/app/debug_admin_token.php`
- `api/storage/app/debug_shared_user_token.php`
- `temp_check_all_superadmins.php`
- `temp_check_superadmin.php`
- `temp_list_tenants.php`
- `temp_make_token.php`
- `temp_tenant_admins.php`
- binary file `-C`

## 8. Suggested Release Preparation Buckets

1. schema and migration review
2. backend services/controllers/config review
3. frontend build and screen validation
4. wa-mirror-service deployment review
5. Meta shared-app rollout checklist and secrets validation
6. explicit decision on whether debug helper files should be excluded from production

## 9. Post-Deploy Commands To Expect

At minimum, review whether these are needed during release:

- `php artisan migrate --force`
- `php artisan meta:invalidate-connections`
- `php artisan settings:encrypt-secrets`

Also verify:

- queue workers
- web push / notification workers
- any WhatsApp mirror service restart requirements

