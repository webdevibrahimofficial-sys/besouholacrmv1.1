# Production Release Audit

Date:

- `2026-08-06`

Production server:

- `root@72.60.89.184`

Live path:

- `/var/www/besouhola/monorepo`

## 1. Verified Production Baseline

Confirmed directly on production:

- deployed marker file: `/var/www/besouhola/monorepo/.deployed-commit`
- deployed commit recorded there: `29914d40`
- latest observed deployment window on server root/assets: `2026-08-01 15:00 UTC`

## 2. Important Exception

On `2026-08-05`, a selective production upload was applied manually for Huawei push only.

That means the following changes are already live even though they are newer than `29914d40`:

- `api/app/Http/Controllers/DeviceTokenController.php`
- `api/app/Models/DeviceToken.php`
- `api/app/Services/FcmService.php`
- `api/app/Services/HuaweiPushService.php`
- `api/config/services.php`
- `api/database/migrations/2026_08_05_120000_add_push_provider_to_device_tokens_table.php`

Operational notes:

- migration `2026_08_05_120000_add_push_provider_to_device_tokens_table.php` was run on production
- `php artisan config:clear` was run on production
- `HUAWEI_PUSH_CLIENT_ID` and `HUAWEI_PUSH_CLIENT_SECRET` were added to `api/.env` as placeholders only

## 3. Local Commits Newer Than Production Marker

Commits in `29914d40..HEAD` as of `2026-08-06`:

1. `f0a2ae32` `2026-08-03` `Fix pipeline report filters and stage localization`
2. `dc8c21bb` `2026-08-03` `Add Besouhola Copilot with per-tenant feature flags and permission-aware tools.`
3. `6f50c517` `2026-08-03` `Improve Besouhola Copilot report routing, filters, and permissions.`
4. `da14b59e` `2026-08-05` `Add copilot drafting updates and Huawei push routing`
5. `fdb66e9a` `2026-08-05` `Fix default meeting status fallback`
6. `a15996e2` `2026-08-05` `Update copilot, leads, and dashboard changes`
7. `c6954c53` `2026-08-06` `Add dashboard avg response time metric`
8. `ba2e1d07` `2026-08-06` `Fix Copilot lead form assignment and field parsing`
9. `3593a310` `2026-08-06` `Fix Copilot delayed-lead follow-up and upgrade Gemini model.`

Commit count ahead of production marker:

- `9` commits total

Commit count still pending after excluding the already-live Huawei-only upload:

- `9` commits still require release review

Note:

- commit `da14b59e` is only partially live because its Huawei push subset was deployed manually, while its Copilot-related changes are still pending

## 4. Remaining Changes Still Not Fully Deployed

### A. Copilot and Tenant Feature Flags

- Besouhola Copilot backend controllers, services, models, and routes
- feature gates and tenant feature enforcement
- Copilot lead drafting and lead-action drafting flows
- frontend Copilot panel and report catalog wiring
- Gemini model/controller updates used by the refreshed Copilot flow

### B. Pipeline, Leads, and Meetings

- pipeline report filter and stage-localization fixes
- lead page/report updates
- default meeting status fallback fix
- meeting action service updates

### C. Dashboard and Reporting

- dashboard response-time metric
- dashboard component and chart updates
- reservations / meetings / pipeline report frontend adjustments

### D. System Admin / Tenant Setup

- system admin dashboard changes
- tenant setup updates
- tenant list hook/state updates
- top-level app state/layout refresh needed by the new flows

## 5. Production-Ready Upload Scope For Next Release

Prepared separately in:

- `docs/production-deploy-manifest-2026-08-06.txt`

That manifest excludes:

- Huawei push files already uploaded manually
- tests
- docs
- debug helpers
- `.env.example`

## 6. Sensitive Items To Review Before Next Upload

- `api/bootstrap/app.php`
- `api/routes/api.php`
- all feature and Copilot migrations
- landlord migrations under `api/database/migrations/landlord/features/`
- `api/database/migrations/landlord/2026_02_18_004034_create_landlord_tenants_table.php`

## 7. Recommended Post-Deploy Commands For The Next Release

Review and run as needed:

- `php artisan migrate --force`
- `php artisan config:clear`
- rebuild/redeploy frontend assets
- restart queue workers if the release process does not already do that
