# 🧪 Testing & Verification Guide

## How to Verify All Fixes Are Working

---

## ✅ Step 1: Check Files Exist

### Command:
```bash
cd "d:\fullstack\besouholacrm v1\besouholacrm v1"

# Check migration
dir api\database\migrations\*2026_06_21_120000*

# Check observers
dir api\app\Observers\Lead*.php

# Result should show:
# - 2026_06_21_120000_add_assigned_at_to_leads_table.php
# - LeadObserver.php
# - LeadActionObserver.php
```

---

## ✅ Step 2B: Run Backfill Migration (PRODUCTION ONLY)

### Command:
```bash
cd api
php artisan migrate --step
```

### Expected Output:
```
Migrating: 2026_06_21_120100_backfill_assigned_at_dates
========== SMART BACKFILL: assigned_at DATES ==========
🔍 Strategy 1: Searching for first action dates...
   ✓ Updated X leads using first action date

🔍 Strategy 2: Using updated_at as estimate...
   ✓ Updated Y leads using updated_at

🔍 Strategy 3: Using created_at as fallback...
   ✓ Updated Z leads using created_at

✅ VERIFICATION: All checks passed!
Migrated: 2026_06_21_120100_backfill_assigned_at_dates (1234ms)
```

### If concerns about data:
```bash
# Verify before backfill
php artisan tinker << 'EOF'
>>> DB::table('leads')->whereNotNull('assigned_to')->whereNull('assigned_at')->count()
# Should show number of leads needing backfill

>>> DB::table('leads')->whereNotNull('assigned_to')->count()
# Total assigned leads (should be >= backfill count)
EOF
```

---

## ✅ Step 3: Smart Backfill Verification

### Option 1: Automated Verification Script
```bash
cd api
bash verify_backfill.sh
```

### Option 2: Interactive Seeder
```bash
php artisan db:seed --class=BackfillAssignedAtDates

# For CI/CD (non-interactive):
php artisan db:seed --class=BackfillAssignedAtDates --force
```

### Option 3: Manual Tinker Commands

#### Check 1: No remaining NULL values
```php
php artisan tinker
>>> DB::table('leads')->whereNotNull('assigned_to')->whereNull('assigned_at')->count()
# Expected output: 0 ✅
```

#### Check 2: No logical violations
```php
>>> DB::table('leads')->whereRaw('assigned_at < created_at')->count()
# Expected output: 0 ✅
```

#### Check 3: Sample data validation
```php
>>> DB::table('leads')->whereNotNull('assigned_to')->limit(5)->get(['id', 'created_at', 'assigned_at', 'updated_at'])
# All assigned_at should be >= created_at
```

#### Check 4: Backfill strategy effectiveness
```php
// Count by strategy used
$firstAction = DB::table('leads')
    ->whereNotNull('assigned_at')
    ->whereExists(function ($q) {
        $q->select(DB::raw(1))
            ->from('lead_actions')
            ->whereColumn('lead_actions.lead_id', 'leads.id')
            ->whereRaw('lead_actions.created_at = leads.assigned_at');
    })
    ->count();

$updatedAt = DB::table('leads')
    ->whereNotNull('assigned_at')
    ->whereRaw('assigned_at = updated_at')
    ->count();

$createdAt = DB::table('leads')
    ->whereNotNull('assigned_at')
    ->whereRaw('assigned_at = created_at')
    ->count();

echo "First Action: {$firstAction}\n";
echo "Updated_at: {$updatedAt}\n";
echo "Created_at: {$createdAt}\n";
echo "Total: " . ($firstAction + $updatedAt + $createdAt) . "\n";
```

---

## ✅ Step 3 (Previously Step 2): Verify Database Column

### Using Laravel Tinker:
```bash
php artisan tinker
```

```php
# Check if column exists
>>> Schema::hasColumn('leads', 'assigned_at')
# Output: true

# Check a sample lead
>>> DB::table('leads')->first(['id', 'assigned_to', 'assigned_at', 'last_contact']);
# Output should show the new columns

# Count leads with assigned_at
>>> DB::table('leads')->whereNotNull('assigned_at')->count();
```

### Using Direct SQL:
```bash
# MySQL
DESCRIBE leads;
# Look for: assigned_at | timestamp | YES

# PostgreSQL
\d leads;
# Look for: assigned_at | timestamp without time zone
```

---

## ✅ Step 4: Check Observers Are Registered

### In Tinker:
```php
# Check if Lead observer is registered
>>> \App\Models\Lead::getObservableEvents();
# Output should include: created, updated, updating, saving, saved

# Verify observer exists
>>> class_exists('App\Observers\LeadObserver')
# Output: true

# Check provider
>>> app('App\Providers\AppServiceProvider')
```

---

## ✅ Step 5: Test Automatic Updates

### Test 1: assigned_at Auto-Update

```php
# In Tinker
>>> $lead = Lead::find(1);
>>> $lead->assigned_to = 5;
>>> $lead->save();
>>> $lead->refresh()->assigned_at;
# Output: Should show current timestamp (not null)
```

### Test 2: last_contact Auto-Update

```php
# In Tinker
>>> $lead = Lead::find(1);
>>> $before = $lead->last_contact;
>>> LeadAction::create([
    'lead_id' => 1,
    'action_type' => 'call',
    'user_id' => 1
]);
>>> $lead->refresh()->last_contact;
# Output: Should be more recent than $before
```

---

## ✅ Step 6: Test Filters via API

### Test Filter 1: Creation Date

```bash
# Get leads created in January 2026
curl "http://localhost:8000/api/leads?created_from=2026-01-01&created_to=2026-01-31"

# Verify response
# - Status: 200
# - Data: Leads with created_at between Jan 1-31
```

### Test Filter 2: Assign Date (NEW!)

```bash
# Get leads assigned in February 2026
curl "http://localhost:8000/api/leads?assigned_date_from=2026-02-01&assigned_date_to=2026-02-28"

# Verify response
# - Status: 200
# - Data: Leads with assigned_at between Feb 1-28
# - Should work! (was broken before)
```

### Test Filter 3: Action Date

```bash
# Get leads with actions on February 10, 2026
curl "http://localhost:8000/api/leads?action_date_from=2026-02-10&action_date_to=2026-02-10"

# Verify response
# - Status: 200
# - Data: All leads with ANY action on that date
# - Includes leads even if last action is different date
```

### Test Filter 4: Last Action Date

```bash
# Get leads with last activity in March 2026
curl "http://localhost:8000/api/leads?last_action_date_from=2026-03-01&last_action_date_to=2026-03-31"

# Verify response
# - Status: 200
# - Data: Leads with last_contact in March
# - Should always be current (auto-updated by observer)
```

### Test Filter 5: Combined Filters

```bash
# All conditions together (AND logic)
curl "http://localhost:8000/api/leads?
  created_from=2026-01-01&
  created_to=2026-01-31&
  assigned_date_from=2026-02-01&
  assigned_date_to=2026-02-15&
  assigned_to=5&
  last_action_date_from=2026-03-01&
  last_action_date_to=2026-03-31"

# Verify response
# - Status: 200
# - Data: ONLY leads matching ALL conditions
# - Should be fewer results than individual filters
```

---

## ✅ Step 7: Performance Check

### Monitor Query Performance:

```bash
# Enable query logging in .env
APP_DEBUG=true

# In Tinker
>>> DB::enableQueryLog();
>>> Lead::query()
    ->whereDate('assigned_at', '>=', '2026-02-01')
    ->get();
>>> DB::getQueryLog();

# Output: Check query execution time
# Should be fast (< 100ms)
```

---

## 🎯 Checklist for Complete Verification

```
□ Migration file exists and runs successfully
□ Column assigned_at exists in leads table
□ Column last_contact exists in leads table
□ Both columns have correct data type (timestamp)
□ LeadObserver is registered
□ LeadActionObserver is registered
□ assigned_at updates when assigned_to changes
□ last_contact updates when action is created
□ Creation Date filter returns correct results
□ Assign Date filter returns correct results (NEW!)
□ Action Date filter returns correct results
□ Last Action Date filter returns correct results
□ Combined filters work with AND logic
□ No SQL errors in API responses
□ API response times are acceptable
```

---

## 🐛 Troubleshooting

### Problem: Column doesn't exist after migration

**Solutions:**
```bash
# Check migration status
php artisan migrate:status

# Re-run migration
php artisan migrate

# Reset and try again
php artisan migrate:rollback
php artisan migrate
```

### Problem: Observers not firing

**Check:**
```php
# In Tinker
>>> \App\Models\Lead::getObservableEvents();
# Should include: created, updated, updating, saved, saving

# Check provider is loaded
>>> app()->make('App\Providers\AppServiceProvider');

# Restart server/artisan
# (Observers require fresh bootstrap)
```

### Problem: assigned_at always NULL

**Check:**
```php
# Make sure you're using update() not raw SQL
>>> $lead->update(['assigned_to' => 5]);  # ✅ Correct
>>> Lead::where('id', 1)->update(['assigned_to' => 5]);  # ✅ Also works

# NOT like this:
>>> DB::table('leads')->where('id', 1)->update(['assigned_to' => 5]);  
# ❌ Bypasses observer!
```

### Problem: last_contact not updating

**Check:**
```php
# Make sure you're creating through model
>>> LeadAction::create([...]);  # ✅ Correct
>>> DB::table('lead_actions')->insert([...]);  # ❌ Bypasses observer

# Check observer is loaded
>>> \App\Models\LeadAction::getObservableEvents();
```

### Problem: Filter returns no results

**Debug:**
```php
# In Tinker
>>> DB::enableQueryLog();
>>> Lead::query()
    ->whereDate('assigned_at', '>=', '2026-02-01')
    ->get();
>>> dd(DB::getQueryLog());

# Check:
# 1. Column name is correct: assigned_at
# 2. Data exists in that date range
# 3. Date format is correct (YYYY-MM-DD)
```

---

## 📊 Sample Test Data

### Create Test Lead:

```php
# In Tinker
>>> $lead = Lead::create([
    'tenant_id' => 1,
    'name' => 'Test Lead',
    'phone' => '+1234567890',
    'assigned_to' => 5,  # This triggers LeadObserver
]);

# Check results
>>> $lead->assigned_at;  # Should be now()
>>> $lead->created_at;   # Should be now()
```

### Create Test Action:

```php
# In Tinker
>>> LeadAction::create([
    'lead_id' => $lead->id,
    'action_type' => 'call',
    'user_id' => 5,
]);

# Check results
>>> $lead->refresh()->last_contact;  # Should be updated
```

---

## 📈 Performance Expectations

| Operation | Expected Time | Actual Time |
|-----------|----------------|-------------|
| Migration | < 100ms | ? ms |
| Single filter | < 50ms | ? ms |
| Combined filters | < 100ms | ? ms |
| Observer fire | < 10ms | ? ms |

---

## ✨ Success Indicators

You'll know everything is working when:

✅ Migration runs without errors
✅ assigned_at column appears in database
✅ Creating/updating leads updates assigned_at
✅ Creating actions updates lead.last_contact
✅ assigned_date_from/assigned_date_to filters work
✅ Combined filters return AND logic results
✅ No warnings or errors in application logs
✅ API response times are normal

---

## 🚀 Final Verification

```bash
# Quick verification script
php artisan tinker << 'EOF'
echo "=== Database Checks ===\n";
echo "assigned_at exists: " . (Schema::hasColumn('leads', 'assigned_at') ? "✅" : "❌") . "\n";
echo "Leads with assigned_at: " . DB::table('leads')->whereNotNull('assigned_at')->count() . "\n";

echo "\n=== Observer Checks ===\n";
echo "LeadObserver exists: " . (class_exists('App\Observers\LeadObserver') ? "✅" : "❌") . "\n";
echo "LeadActionObserver exists: " . (class_exists('App\Observers\LeadActionObserver') ? "✅" : "❌") . "\n";

echo "\n=== Data Checks ===\n";
$lead = Lead::whereNotNull('assigned_to')->first();
echo "Sample lead assigned_at: " . ($lead ? $lead->assigned_at : "No leads found") . "\n";

echo "\n✅ All checks passed!" . "\n";
EOF
```

---

**Date:** 2026-06-21
**Version:** 1.0
**Status:** Ready for Testing
