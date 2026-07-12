# Pending Production Changes

Reference list of changes currently not considered deployed to production.

## Baseline Assumption

This list assumes that current production is aligned with:

- `origin/main`

Current working branch:

- `feature/contract-editor-user-scope-updates`

## 1. Local-Only Commits Not Yet Pushed

These commits exist locally and are not yet pushed to `webdevibrahimofficial-sys-v1/feature/contract-editor-user-scope-updates`:

1. `681a9cd3` `feat: expand super admin billing and system management flows`
2. `5b2ec8fa` `chore: remove tracked environment files`

These are the most immediate changes that are definitely not on the current remote feature branch.

## 2. Branch Changes Not in Production

The current feature branch contains a large set of changes ahead of `origin/main`.

High-level areas pending production:

### A. Super Admin and System Management

- super admin dashboard refresh and management flows
- super admin user management and permissions improvements
- stronger super admin impersonation/access behavior
- system tools and admin workspace refinements
- inactive tenant blocking and tighter super admin access

### B. Subscription, Billing, Contracts, and Transactions

- tenant subscription plan management
- subscription pricing support
- tenant subscription contract management
- subscription transaction ledger and transaction items
- backend controllers, models, services, and migrations for billing flows
- frontend super admin pages for subscriptions and transactions

### C. Tenant Setup and System Admin UX

- expanded tenant setup flows
- audit logs improvements
- security settings updates
- system error log enhancements
- system admin dashboard/users/tasks updates

### D. Lead Management and Reporting

- lead workflow fixes and refinements
- delayed leads improvements
- lead history import flow
- safer action date handling and reporting filters
- pending/display-stage alignment between leads and reports
- report export and date range improvements
- country support in leads
- lead notifications and assignee handling updates

### E. Website CMS and Public Website

- CRM-connected public website
- editable hero/CMS controls
- website content loading fixes
- careers management and public careers pages
- legal/public site pages
- website lead intake analytics and observability
- lead leak reporting
- website content and hero/footer/contact layout improvements

### F. WhatsApp and Communication

- WhatsApp mirror provider/runtime flows
- mirror history sync and lead linking
- WhatsApp message handling hardening
- communication statistics and message UI updates

### G. Notifications and Device Tokens

- web push notifications
- FCM device token registration
- queued push delivery
- reminder commands and notification recipient controls

### H. Meta / Integrations / Imports

- Shared Meta App migration (single app configured in Super Admin for all tenants)
- Global webhook URL `/api/meta/webhook` with tenant routing by `page_id`
- Tenant UI simplified to Facebook login + page selection only
- Encrypted shared `meta_app_secret` in `system_settings`
- Facebook Data Deletion callback with audit log (`meta_data_deletion_requests`)
- Post-deploy command: `php artisan meta:invalidate-connections`
- Meta App Review URLs to configure in Meta Developer Console:
  - Privacy Policy URL: `{FRONTEND_URL}/privacy`
  - Data Deletion Callback URL: `{APP_URL}/api/facebook/data-deletion`
  - Data Deletion Status URL: `{FRONTEND_URL}/privacy/data-deletion`
- **Post-migration hardening (pending deploy):**
  - Auto-subscribe pages to `leadgen` webhook after `syncAssets`
  - Public data deletion status: `GET /api/facebook/data-deletion/status` + `/privacy/data-deletion` page
  - Cross-tenant `page_id` conflict guard with `sync_warnings` in tenant status API/UI
  - `needs_reauth` notifications for tenant admins + Super Admin (`meta:invalidate-connections`)
  - Per-form lead mapping UI + `POST /api/meta/capi/test` diagnostics endpoint
  - Super Admin Meta health dashboard + webhook verify (`/api/super-admin/meta/health`, `test-webhook`)
  - Encrypted `google_client_secret` + `php artisan settings:encrypt-secrets`
  - Meta API rate limit observability (`rate_limit_events_24h` in health endpoint)
  - `MetaCredentialsResolver` rename (alias `TenantMetaCredentialsResolver` retained)
  - Runbook: `docs/meta-shared-app-runbook.md`
  - Tests: `MetaAutoSubscribeTest`, `MetaPageConflictTest`, `MetaDataDeletionStatusTest`, `MetaCapiTest`, `MetaHealthTest`, `GoogleSecretEncryptionTest`
- OAuth scope/environment improvements
- asset/campaign sync adjustments
- safer import flows and history import support

### I. User Scope / Agency / Visibility

- user scope filters for visibility
- agency management support
- source/project/user visibility refinements

### J. Documentation and Deployment Notes

- lead management final mobile handoff
- deployment/backfill guides
- production readiness and operational notes

## 3. Files Added or Touched in the Latest Local Commit

The latest local billing/system-management commit includes work across:

### Backend

- new controllers for:
  - plan prices
  - subscription transactions
  - tenant subscription contracts
- new models for:
  - subscription plan prices
  - subscription transactions
  - subscription transaction items
  - tenant subscription contracts
- new services for subscription and contract flows
- new job for system error notifications
- super admin activity logging trait
- billing and system-error related migrations

### Frontend

- `SystemSubscriptions`
- new `SystemTransactions`
- `SystemAdminDashboard`
- `SystemAdminUsers`
- `SystemErrorLog`
- `SystemTasks`
- `TenantSetup`
- system `AuditLogs`
- system `SecuritySettings`
- `WebsiteCms`
- related router updates

### Docs

- finalized lead management mobile handoff:
  - `docs/lead-management-final.md`

## 4. Sensitive / Deployment-Relevant Items

These items should be reviewed explicitly before production deployment:

- database migrations under `api/database/migrations/`
- landlord migrations under `api/database/migrations/landlord/`
- environment-related files:
  - `api/.env.bak`
  - `api/.env.docker`
- route changes in:
  - `api/routes/api.php`
- bootstrap/config changes in:
  - `api/bootstrap/app.php`
  - `api/config/app.php`
- any queue/job-dependent features:
  - notifications
  - system error job
  - ledger/backfill command

## 5. Recommended Deployment Grouping

When deployment is requested later, the safest grouping is:

1. backend schema and config changes
2. backend business logic/controllers/services
3. frontend super admin and tenant setup views
4. website/CMS changes
5. optional docs-only artifacts

## 6. Quick Summary

At the moment, there are two categories of pending work:

1. local-only commits not pushed anywhere yet
2. a much larger branch history that is ahead of `origin/main` and therefore should be treated as not yet in production

If needed later, this document can be converted into:

- a deployment checklist
- a migration-first release plan
- a rollback-aware production release plan
