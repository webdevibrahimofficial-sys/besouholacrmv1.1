# Lead Date Filters - Implementation Guide

## ✅ Summary of Changes

تم تطبيق جميع الإصلاحات المطلوبة لتحقيق متطلبات نظام فلترة التواريخ للـ Leads كما هو موضح في الوثيقة.

---

## 📁 Files Created/Modified

### 1. Database Migration (New)
**File:** `api/database/migrations/2026_06_21_120000_add_assigned_at_to_leads_table.php`

يضيف العمود `assigned_at` إلى جدول leads:
```php
$table->timestamp('assigned_at')->nullable()->after('assigned_to');
```

**الخطوات:**
```bash
cd api
php artisan migrate
```

---

### 2. Observers (New)

#### A. LeadObserver
**File:** `api/app/Observers/LeadObserver.php`

المسؤول عن تحديث `assigned_at` عند:
- تعيين lead لموظف في المرة الأولى
- إعادة تعيين lead لموظف آخر

```php
// الكود يعدل assigned_at في حدث updating
if ($lead->isDirty('assigned_to')) {
    $lead->assigned_at = now();
}
```

#### B. LeadActionObserver  
**File:** `api/app/Observers/LeadActionObserver.php`

يحدث `leads.last_contact` تلقائياً عند:
- إنشاء action جديد على lead
- تحديث action موجود

```php
// يحدث leads.last_contact = now()
Lead::where('id', $action->lead_id)->update([
    'last_contact' => now(),
]);
```

---

### 3. LeadController Updates
**File:** `api/app/Http/Controllers/LeadController.php`

#### تصحيح buildFilteredLeadsQuery (Line ~1425)

**قبل:**
```php
// كان يفتش عن أعمدة غير موجودة
foreach (['assigned_at', 'assigned_date', 'assign_date'] as $c) {
    if (Schema::hasColumn('leads', $c)) { // ❌ لا توجد
        $assignedCol = $c;
    }
}
```

**بعد:**
```php
// الآن يستخدم العمود الجديد مباشرة
if ($request->filled('assigned_date_from')) 
    $query->whereDate('leads.assigned_at', '>=', $request->assigned_date_from);
if ($request->filled('assigned_date_to')) 
    $query->whereDate('leads.assigned_at', '<=', $request->assigned_date_to);
```

#### توحيد Last Action Date
**قبل:** كان يستخدم عمودين مختلفين (`updated_at` و `last_contact`)

**بعد:** يستخدم `last_contact` دائماً:
```php
// في pipelineReport
if ($request->filled('last_action_date_from')) {
    $query->whereDate('leads.last_contact', '>=', $request->last_action_date_from);
}
```

#### تحسين applyReferralFilters
أضيف فلاتر إضافية:
```php
if ($request->filled('assigned_date_from')) 
    $query->whereDate('leads.assigned_at', '>=', $request->assigned_date_from);
if ($request->filled('last_action_date_from')) 
    $query->whereDate('leads.last_contact', '>=', $request->last_action_date_from);
```

---

### 4. Models Updated

#### Lead Model
**File:** `api/app/Models/Lead.php`

أضيف datetime casts:
```php
protected $casts = [
    'assigned_at' => 'datetime',
    'last_contact' => 'datetime',
];
```

#### LeadAction Model
**File:** `api/app/Models/LeadAction.php`

تحسين datetime casts:
```php
protected $casts = [
    'created_at' => 'datetime',
    'updated_at' => 'datetime',
];
```

---

### 5. Service Provider
**File:** `api/app/Providers/AppServiceProvider.php`

تسجيل الـ Observers:
```php
public function boot(): void {
    // Register Observers
    Lead::observe(LeadObserver::class);
    LeadAction::observe(LeadActionObserver::class);
}
```

---

## 🔍 How Date Filters Work Now

### 1️⃣ Creation Date
```
Query: created_from -> created_to
Database: leads.created_at
Usage: تاريخ إنشاء Lead الأول في النظام
Status: ✅ يعمل
```

### 2️⃣ Assign Date
```
Query: assigned_date_from -> assigned_date_to
Database: leads.assigned_at (جديد)
Usage: تاريخ تعيين Lead لموظف
Status: ✅ الآن يعمل (كان معطل)
```

### 3️⃣ Action Date
```
Query: action_date_from -> action_date_to
Database: lead_actions.created_at
Usage: أي Lead به Action في الفترة المحددة
Status: ✅ يعمل (يفحص ALL actions، ليس الأخير فقط)
```

### 4️⃣ Last Action Date
```
Query: last_action_date_from -> last_action_date_to
Database: leads.last_contact (محدث تلقائياً)
Usage: آخر تفاعل مع Lead
Status: ✅ الآن صحيح ومتسق
```

---

## ✨ Combined Filtering (AND Logic)

جميع الفلاتر تعمل معاً بـ AND logic:

```php
// مثال:
GET /api/leads?
  created_from=2026-01-01&
  created_to=2026-01-31&
  assigned_date_from=2026-02-01&
  assigned_date_to=2026-02-15&
  assigned_to=5&
  last_action_date_from=2026-03-01&
  last_action_date_to=2026-03-31

// النتيجة: جميع Leads التي تطابق جميع الشروط
```

---

## 🚀 Deployment Steps

### 1. Pull Latest Code
```bash
git pull origin
```

### 2. Run Migration
```bash
cd api
php artisan migrate --step
```

**Output المتوقع:**
```
Migrating: 2026_06_21_120000_add_assigned_at_to_leads_table
Migrated: 2026_06_21_120000_add_assigned_at_to_leads_table (xxx ms)
```

### 3. (Optional) Backfill assigned_at
إذا كان لديك leads موجودة:
```bash
php artisan tinker
>>> DB::table('leads')->where('assigned_to', '!=', null)->update(['assigned_at' => DB::raw('updated_at')]);
```

### 4. Test Filters
```bash
# Example API call
curl "http://localhost:8000/api/leads?assigned_date_from=2026-03-01&assigned_date_to=2026-03-31"
```

---

## 📊 Testing Scenarios

### Scenario 1: Filter by Creation Date
```
Created: 01/01/2026 ✅ (in range)
Assigned: 15/01/2026
Last Action: 20/01/2026
Result: ✅ Shown
```

### Scenario 2: Filter by Assigned Date
```
Created: 15/01/2026
Assigned: 05/02/2026 ✅ (in range)
Last Action: 20/01/2026
Result: ✅ Shown
```

### Scenario 3: Filter by Action Date
```
Created: 01/01/2026
Actions: 
  - 05/01/2026
  - 10/01/2026 ✅ (in range)
  - 20/01/2026
Result: ✅ Shown (even if last action is 20/01)
```

### Scenario 4: Combined Filters
```
Created: ✅ (01/01-31/01/2026)
Assigned: ✅ (01/02-15/02/2026)
Last Action: ✅ (01/03-31/03/2026)
Result: ✅ Shown (all conditions met)
```

---

## 🐛 Known Issues Fixed

| المشكلة | الحل | الحالة |
|--------|-----|--------|
| No assigned_at column | Added migration + observer | ✅ Fixed |
| last_contact not updated | LeadActionObserver | ✅ Fixed |
| Inconsistent date columns | Unified to last_contact | ✅ Fixed |
| Schema checks failing | Direct column usage | ✅ Fixed |

---

## 📝 Notes

- **Observers** يعملون تلقائياً عند `create` و `update` على Models
- **last_contact** يُحدّث دائماً عند إنشاء أي action
- **assigned_at** يُحدّث عند تغيير `assigned_to`
- جميع التواريخ محفوظة بـ **UTC** في قاعدة البيانات

---

## ❓ Troubleshooting

### Migration Failed
```
Error: Column already exists
Solution: العمود قد يكون موجود بالفعل، تحقق من جدول leads
```

### Filters Not Working
```
1. تأكد من تشغيل Migration
2. تحقق من أسماء الحقول في الطلب (request parameters)
3. تأكد من تسجيل الـ Observers في AppServiceProvider
```

### No Results Returned
```
قد يكون السبب:
1. لا توجد leads بالتواريخ المطلوبة
2. البيانات الموجودة لم تُحدّث بعد (last_contact)
3. استخدام AND logic بدلاً من OR
```

---

**التاريخ:** 2026-06-21
**الإصدار:** v1.0
**الحالة:** ✅ جميع الإصلاحات مطبقة وجاهزة للـ Deployment
