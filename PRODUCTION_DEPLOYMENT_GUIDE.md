# 🚀 Production Deployment Guide - Lead Date Filters

## مرحلة الـ Production: دليل الـ Deployment الآمن

تم إنشاء استراتيجية احترافية لضمان عدم فقدان البيانات أو تعطيل النظام:

---

## 📋 Pre-Deployment Checklist

### ✅ 1. Backup & Safety Measures

```bash
# ===== STEP 1: DATABASE BACKUP =====
# MySQL
mysqldump -u root -p besouholacrm_db > backup_$(date +%Y%m%d_%H%M%S).sql

# PostgreSQL
pg_dump besouholacrm_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup exists
ls -lh backup_*.sql
```

### ✅ 2. Maintenance Mode (Optional)

```bash
# Enable maintenance mode (prevents user access)
php artisan down --message="Deploying Lead Date Filters Update"

# Later: Disable maintenance mode
php artisan up
```

### ✅ 3. Code Deployment

```bash
# Pull latest code
git pull origin main

# Verify files exist
ls -la api/database/migrations/2026_06_21_120*.php
ls -la api/database/seeders/BackfillAssignedAtDates.php
ls -la api/app/Observers/Lead*.php
```

---

## 🔄 Deployment Execution

### Phase 1: Column Addition (No Data Loss)

```bash
cd api

# Run main migration
php artisan migrate --step

# Expected:
# Migrating: 2026_06_21_120000_add_assigned_at_to_leads_table
# Migrated: 2026_06_21_120000_add_assigned_at_to_leads_table (45ms)
```

**Status:** ✅ Safe - New column added, no existing data affected

---

### Phase 2: Smart Data Backfill

#### Option A: Automatic Migration (Recommended)

```bash
# Run backfill migration
php artisan migrate --step

# Output will show:
# ========== SMART BACKFILL: assigned_at DATES ==========
# 🔍 Strategy 1: First Action Date → X leads
# 🔍 Strategy 2: Updated_at → Y leads
# 🔍 Strategy 3: Created_at → Z leads
# ✅ VERIFICATION: All checks passed!
```

**Benefits:**
- Automatic fallback strategy
- Built-in verification
- Atomic transaction (all-or-nothing)
- Safe rollback if issues

---

#### Option B: Interactive Seeder (For Large Databases)

```bash
# For production with confirmation
php artisan db:seed --class=BackfillAssignedAtDates

# For CI/CD (no confirmation)
php artisan db:seed --class=BackfillAssignedAtDates --force
```

**Output:**
```
╔════════════════════════════════════════════════════════════╗
║  SMART BACKFILL SEEDER: assigned_at for Lead Dates        ║
║  Strategy: Action Date → Updated_at → Created_at          ║
╚════════════════════════════════════════════════════════════╝

📊 DATABASE STATISTICS:
   Total leads: 50000
   Assigned leads: 45000
   Needs backfill: 45000

🚀 STARTING BACKFILL...

📍 TIER 1: Extracting first action dates...
   ✓ Updated 15000 leads using first action date

📍 TIER 2: Using updated_at as estimate...
   ✓ Updated 20000 leads using updated_at

📍 TIER 3: Using created_at as fallback...
   ✓ Updated 10000 leads using created_at

🔍 VERIFICATION:
   Remaining NULL assigned_at: 0
   Logical violations: 0
   ✅ All checks passed!

╔════════════════════════════════════════════════════════════╗
║  ✅ BACKFILL COMPLETE                                      ║
╚════════════════════════════════════════════════════════════╝
```

---

### Phase 3: Verification (Critical!)

#### Option A: Automated Script

```bash
# Run comprehensive verification
bash api/verify_backfill.sh

# This runs 6 verification steps automatically
```

#### Option B: Manual Verification

```bash
php artisan tinker

# Check 1: No remaining NULL values
>>> DB::table('leads')->whereNotNull('assigned_to')->whereNull('assigned_at')->count()
# Expected: 0 ✅

# Check 2: No logical violations
>>> DB::table('leads')->whereRaw('assigned_at < created_at')->count()
# Expected: 0 ✅

# Check 3: Total assigned leads processed
>>> DB::table('leads')->whereNotNull('assigned_at')->count()
# Expected: should match number of assigned leads

# Check 4: Test new lead creation with observer
>>> $lead = App\Models\Lead::create(['name' => 'Test', 'phone' => '+1234567890', 'assigned_to' => 1]);
>>> $lead->assigned_at !== null
# Expected: true ✅
```

---

## 🎯 Success Criteria

All of the following must be true:

```
✅ No NULL assigned_at where assigned_to is NOT NULL
✅ No logical violations (assigned_at >= created_at)
✅ First migration ran successfully
✅ Backfill migration ran successfully (automatic verification passed)
✅ Observers are registered and working
✅ New leads get assigned_at automatically
✅ Actions update last_contact automatically
✅ All filters working correctly
```

If ANY of these fail, execute **Rollback** (see section below)

---

## 🔙 Rollback Plan (If Issues Occur)

### Immediate Rollback (Within 24 hours)

```bash
# Step 1: Rollback backfill migration
php artisan migrate:rollback --steps=1

# This safely removes the backfilled dates
# New leads assigned after deployment are preserved

# Step 2: Verify rollback
php artisan migrate:status | grep "2026_06_21"
# Should show: not migrated
```

### Full Rollback (Remove column entirely)

```bash
# Step 1: Rollback backfill
php artisan migrate:rollback --steps=1

# Step 2: Rollback column addition
php artisan migrate:rollback --steps=1

# Step 3: Verify
php artisan migrate:status | grep "2026_06_21"
# Should show: not migrated for both
```

### Database Restore (Last Resort)

```bash
# Stop application
php artisan down

# Restore from backup
mysql -u root -p besouholacrm_db < backup_YYYYMMDD_HHMMSS.sql

# Verify
php artisan tinker
>>> DB::table('leads')->count()
# Should match backup state

# Restart
php artisan up
```

---

## 📊 Monitoring After Deployment

### Monitor Logs

```bash
# Real-time log monitoring
tail -f storage/logs/laravel.log

# Look for errors related to:
# - LeadObserver
# - LeadActionObserver
# - assigned_at updates
```

### Monitor Performance

```bash
php artisan tinker

# Check observer performance
>>> $start = microtime(true);
>>> $lead = App\Models\Lead::create(['name' => 'Test', 'phone' => '+1', 'assigned_to' => 1]);
>>> echo (microtime(true) - $start) . "s";
# Expected: < 100ms

# Check filter performance
>>> $start = microtime(true);
>>> App\Models\Lead::whereDate('assigned_at', '>=', now()->subMonth())->count();
>>> echo (microtime(true) - $start) . "s";
# Expected: < 50ms
```

### Monitor Data Integrity

```bash
# Daily check (can be automated)
php artisan tinker

# No stale assigned_at
>>> DB::table('leads')->whereRaw('assigned_at > updated_at')->count()
# Expected: 0 (shouldn't happen with our strategy)

# No illogical data
>>> DB::table('leads')->whereRaw('assigned_at < created_at')->count()
# Expected: 0
```

---

## 📈 Deployment Timeline

```
T-24h:  Database backup
T-1h:   Enable maintenance mode
T-0:    Pull code
T+5min: Run migration (column add)
T+10min: Run backfill migration
T+15min: Run verification
T+20min: Disable maintenance mode
T+1h:   Monitor logs
T+24h:  Verify data integrity (final check)
```

---

## 🚨 Troubleshooting

### Issue: Migration fails due to constraint

**Solution:**
```bash
# Check current migration state
php artisan migrate:status

# If stuck, use force flag (USE WITH CAUTION)
php artisan migrate --force --step

# If still fails, check database logs
mysql -u root -p -e "SHOW ENGINE INNODB STATUS;"
```

### Issue: Backfill takes too long

**Solution:**
```bash
# Process is chunking by 100 records automatically
# Monitor with:
tail -f storage/logs/laravel.log

# If still slow, check database performance:
# - Check disk space
# - Check CPU usage
# - Check if locks present
```

### Issue: Observer not firing

**Solution:**
```bash
# Verify observer is registered
php artisan tinker
>>> \App\Models\Lead::getObservableEvents()
# Should include: created, updated, updating

# Verify file exists
ls -la app/Observers/Lead*.php

# Clear config cache
php artisan config:clear

# Restart queue/workers if used
```

### Issue: Filter returns wrong results

**Solution:**
```bash
# Verify backfill completed
php artisan tinker
>>> DB::table('leads')->whereNotNull('assigned_to')->whereNull('assigned_at')->count()
# Expected: 0

# Clear cache
php artisan cache:clear

# Restart application
php artisan down && php artisan up
```

---

## 📞 Support & Escalation

### If anything fails:

1. **Do NOT restart**: Keep application running
2. **Check logs**: `tail -f storage/logs/laravel.log`
3. **Run verification**: `bash api/verify_backfill.sh`
4. **Execute rollback** if needed (see section above)
5. **Contact**: Development team with logs

### Critical Contacts:
- Database Admin: For backup/restore
- DevOps: For deployment issues
- Development Lead: For code-related issues

---

## ✅ Post-Deployment Checklist

- [ ] All migrations ran successfully
- [ ] Verification script passed all tests
- [ ] No errors in logs
- [ ] Lead filters working (test via API)
- [ ] Observers functioning (create test lead)
- [ ] Performance acceptable (< 100ms response)
- [ ] Database backup verified
- [ ] Team notified of deployment
- [ ] Documentation updated

---

## 🎉 Success Indicators

You know the deployment was successful when:

1. ✅ All 4 date filters work correctly
2. ✅ Combined filters return AND logic results
3. ✅ New leads automatically get assigned_at
4. ✅ Actions automatically update last_contact
5. ✅ No errors in production logs
6. ✅ User reports show correct data
7. ✅ API response times are normal
8. ✅ Database backups exist

---

**Deployment Status:** ✅ READY FOR PRODUCTION

**Last Updated:** 2026-06-21
**Version:** 1.0
**Environment:** Production-Ready
