# Production Gap Audit

Date of audit:

- `2026-07-02`

Server checked:

- `root@72.60.89.184`

## 1. What Was Verified

Checked directly on production server over SSH.

Confirmed live application path:

- `/var/www/besouhola/monorepo`

Important finding:

- production is **not** a git checkout
- no `.git` directory exists in the live app path
- current production appears to be deployed from artifacts / copied files

Because of that, production cannot be mapped to a single git commit with full certainty.

## 2. Production State Observed

### Frontend deployment clue

Live frontend root files under:

- `/var/www/besouhola/monorepo`

Notable timestamp:

- `index.html` => `2026-06-27 15:39:55 +0000`

This aligns approximately with local commit history up to:

- `ff69243f` `Fix public website CMS and tenant content loading`

and before:

- `77470c49` `Adjust website hero headline layout`
- `67b79690` `Fix contact form success render crash`
- `f2fa6ae0` `Restrict website lead notifications by role`

### Backend deployment clue

Live backend files show mixed timestamps, for example:

- `api/app/Services/WebsiteLeadIntakeService.php` => `2026-06-27 17:21:37 +0000`
- `api/app/Http/Controllers/SystemCompanyWebsiteController.php` => `2026-06-27 12:58:05 +0000`
- `api/app/Http/Controllers/LeadController.php` => `2026-06-25 15:45:34 +0000`
- `api/bootstrap/app.php` => `2026-06-09 13:37:18 +0000`

This means production backend is also not a clean single-commit release.

It is a **mixed deploy** with some files newer than others.

## 3. Safe Interpretation

Since production is mixed, the safest boundary is:

- treat all commits **after** `f2fa6ae0` as definitely not deployed

Reason:

- no verified production code file indicates a release newer than the `2026-06-27` late-evening local history window
- `f2fa6ae0` is the latest strong backend-related reference point observed near that window

## 4. Commits Definitely Not Raised To Production

These commits are after the latest strongly-supported production window and should be treated as not deployed:

1. `968242f9` `Fix cancellation report chart totals and project labels`
2. `1bf3d2d1` `Update cancellation report reasons and labels`
3. `caac9549` `Implement super admin dashboard and management views`
4. `199726b4` `feat: add tenant subscription plan management`
5. `ce7fd01e` `fix: block inactive tenants and tighten super admin access`
6. `7a28da9c` `feat: refresh the super admin workspace UI`
7. `9edf63ac` `chore: improve super admin system tools and notes`
8. `9aef5bb7` `Add super admin user management and permission UI improvements`
9. `c2bc5e02` `feat: enhance system tasks preview and due date requests`
10. `5b2ec8fa` `chore: remove tracked environment files`
11. `681a9cd3` `feat: expand super admin billing and system management flows`

## 5. Important Note About Older Commits

There may be older commits before `f2fa6ae0` that are also not fully reflected on production, because the server is a mixed file deployment and not a single git revision.

So this file gives:

- a **high-confidence list** of commits definitely not deployed

It does **not** guarantee that everything before `f2fa6ae0` is fully deployed.

## 6. Recommendation Before Future Deployment

Before pushing to production later:

1. deploy from a single known git revision or tagged artifact
2. record the deployed commit SHA on the server in a file such as:
   - `REVISION`
   - or `release.json`
3. avoid partial file-copy releases when possible

## 7. Current Local Branch

Current local branch during audit:

- `feature/contract-editor-user-scope-updates`

Current local HEAD during audit:

- `681a9cd3`
