# Production Deploy Checklist

- Baseline reviewed: `7b3c00c373f05693d3d5ebb792f5e623d4177f2b`
- Deploy scope: backend, frontend, website app, config examples, migrations, tests

## Before deploy
- Backup the database.
- Confirm `.env` on production is not overwritten.
- Build deploy artifacts with:
  - `powershell -ExecutionPolicy Bypass -File .\deploy-build-artifacts.ps1`
- Verify you are not uploading `.env`, logs, local cache, `node_modules`, `vendor`, or backend `bootstrap/cache/*`.
- Frontend `dist` is allowed only inside the frontend artifact after a fresh build.
- Never upload `api/bootstrap/cache/packages.php` or `api/bootstrap/cache/services.php` from local/dev.

## After deploy
- `composer install --no-dev --optimize-autoloader` if backend dependencies changed.
- `php artisan optimize:clear` before rebuilding caches, especially after backend artifact replacement.
- `php artisan migrate --force` because migrations changed.
- `php artisan config:cache`
- `php artisan route:cache` if your routes are cache-safe.
- Build frontend assets because frontend and website files changed:
  - `cd frontend && npm ci && npm run build`
  - `cd website/apps/web && npm ci && npm run build`
- Restart queue workers / supervisor because jobs and queue config changed.
  - `php artisan queue:restart`
  - `supervisorctl restart all` or the specific worker program
  - `php artisan horizon:terminate` if Horizon is used
- Restart PHP-FPM if opcache is sticky on your server.

## Smoke test
- Login.
- Leads and users screens.
- Meta integration.
- Website CMS and public website pages.
- Broker preview / check-in flow.
