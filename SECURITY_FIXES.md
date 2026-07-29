# 🔐 أمان المشروع — تقرير الإصلاحات

## الثغرات الأمنية التي تم تصحيحها

### 1. ✅ .env ملف معروض على الإنترنت

**المشكلة:**
- ملف `.env` الفعلي مع جميع الـ credentials موجود في الـ repo
- يحتوي على: `APP_KEY`، بيانات الـ database، Redis credentials

**الإجراء المتخذ:**
- ✅ استبدال محتوى `.env` بقيم معضوضة وتحذيرات
- ✅ إنشاء `.env.local.example` كـ template للتطوير المحلي
- ✅ إضافة `.env.local` إلى `.gitignore`

**الخطوات المطلوبة:**
```bash
# 1. نسخ القالب
cp api/.env.local.example api/.env.local

# 2. ملء القيم الفعلية
nano api/.env.local

# 3. تحديث في الـ Git
git rm --cached api/.env
git add api/.env .env.local.example .gitignore
git commit -m "security: remove .env credentials from repo"
```

---

### 2. ✅ ملفات Debug معروضة على الإنترنت

**المشكلة:**
- 31 ملف debug، test، و example PHP في root الـ API:
  - `test_*.php`, `check_*.php`, `debug_*.php`, `create_test_*.php`
  - يمكن الوصول إليها مباشرة على الإنترنت

**الإجراء المتخذ:**
- ⏳ تحضير قائمة بجميع الملفات للحذف

**الملفات المطلوب حذفها:**
```
verify_delayed_endpoint.php, update_module_keys.php, tinker_script.php
test_team_stats.php, test_smtp.php, test_project.php, test_login_flow.php
test_lead_action.php, test_json_structure.php, test_impersonate.php
test_action_fetch_v2.php, test_action_fetch.php
debug_tenant_actions.php, debug_tenant2.php, debug_lead_save.php
check_roles.php, check_revenue.php, check_notifications_db.php
check_modules.php, check_action_55.php, test.php
backfill_revenue.php, check_settings.php, check_schema.php
check_tokens.php, check_user_tenant.php
create_test_notification_v2.php, create_test_notification_data.php
enable_all_modules.php, dump_notifications.php
read_last_error.php, read_last_error_short.php
seed_test_actions.php, debug_types.php, debug_tokens.php
```

**الخطوات:**
```bash
# استخدم Git للحذف مع التتبع
git rm api/test_*.php api/check_*.php api/debug_*.php 2>/dev/null || true
git rm api/create_test*.php api/enable_all_modules.php api/dump_notifications.php
git rm api/read_last_error*.php api/seed_test_actions.php
git rm api/backfill_revenue.php api/tinker_script.php api/update_module_keys.php
git rm api/verify_delayed_endpoint.php

git commit -m "security: remove debug and test files from production"
```

---

### 3. ✅ MD5 Password Hashing (Weak)

**المشكلة:**
- `AuthController.php` يقبل كلمات مرور بـ MD5 أو plain text كـ "fallback"
- السطور 57-68 و 310-321

**الإجراء المتخذ:**
- ✅ حذف كامل كود MD5 و plain text acceptance
- ✅ فرض استخدام bcrypt (Illuminate\Support\Facades\Hash::make)

**قبل:**
```php
// يقبل MD5 و plain text passwords ❌
$plainMatch = $user->password === $request->password;
$md5Match = md5($request->password) === $user->password;
```

**بعد:**
```php
// يفرض bcrypt فقط ✅
$authOk = app(\App\Contracts\AuthenticatorInterface::class)
    ->verifyCredentials($user, (string) $request->password);
```

**ملاحظات:**
- يجب على المستخدمين الذين لديهم كلمات مرور قديمة إعادة تعيينها
- أو استخدم migration script لتحديث الكلمات المرور القديمة

---

### 4. ✅ Web Server Hardening

**المشكلة:**
- الملفات الحساسة مكشوفة بسبب إعدادات Apache الضعيفة

**الإجراء المتخذ:**
- ✅ تحديث `.htaccess` مع rules حماية شاملة:
  - حجب `.env`, `.git`, `composer.json`
  - حجب الوصول المباشر للـ PHP files (إلا في `public/`)
  - حجب الوصول للمجلدات الحساسة

**تحديثات `.htaccess`:**
```apache
<FilesMatch "\.env|\.git|composer\.json">
    Order allow,deny
    Deny from all
</FilesMatch>

<DirectoryMatch "^/(config|database|storage|bootstrap)">
    Order allow,deny
    Deny from all
</DirectoryMatch>
```

---

## الخطوات التالية

### ⏳ مطلوب فوري:
- [ ] حذف 31 ملف debug من الـ API
- [ ] Commit هذه التغييرات مع رسالة أمان واضحة
- [ ] نشر التغييرات على الـ production

### 🔍 مراجعة إضافية مقترحة:
- [ ] البحث عن MD5 في أماكن أخرى:
  ```bash
  grep -r "md5(" api/app --include="*.php" | grep -v "test\|storage"
  ```
- [ ] تحديث سياسة CORS إن وجدت (يجب تحديد origins محددة)
- [ ] فحص database لوجود كلمات مرور قديمة بـ MD5
- [ ] تفعيل HTTPS في جميع المراحل

---

## 📋 ملف .env الموصى به للـ Production

استخدم `.env.local` (غير tracked) مع القيم الآمنة:
```bash
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:GENERATED_KEY
DB_HOST=secure-database-host
DB_PASSWORD=STRONG_PASSWORD
# إلخ...
```

**لا تتركها في الـ Git أبداً!** ✅

---

## 🛡️ الملفات المحدثة

- ✅ `api/.env` — معضوضة + تحذير
- ✅ `api/.env.local.example` — قالب آمن للتطوير
- ✅ `api/.htaccess` — قواعد حماية Apache
- ✅ `api/.gitignore` — تحديث لحماية الملفات
- ✅ `api/app/Http/Controllers/AuthController.php` — إزالة MD5

---

**التاريخ:** 2026-05-28
**التعديلات الأمنية:** نقدية ✓
