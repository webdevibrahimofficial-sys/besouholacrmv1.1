# Android Integration Notes — CRM Updates 2026-07-22

> ملاحظات لمبرمج Android بعد آخر رفع Production بتاريخ **2026-07-22**.

## عام

- كل الـ endpoints تحت نفس الـ API base المستخدم حاليًا.
- كل الطلبات المحمية تحتاج `Authorization: Bearer <token>`.
- حالة تفعيل الموديولات ترجع في `/api/me` أو profile payload داخل `enabled_modules`.
- موديول Telesales يظهر في التطبيق فقط لو `enabled_modules` يحتوي `telesales`.
- لو الموديول غير مفعّل، أخفِ كل شاشات/روابط Telesales وكذلك `Not Interest Reasons`.

## 1. Telesales Module

### إظهار الموديول

اعرض Telesales فقط عند تحقق الشرط:

```kotlin
enabledModules.contains("telesales")
```

مع مراعاة صلاحيات المستخدم داخل:

```json
user.meta_data.module_permissions.Telesales
```

أهم الصلاحيات:

- `showModule`
- `viewDashboard`
- `viewReports`
- `viewHistoricalRecords`
- `createLead`
- `assignLead`
- `bulkTransferToSales`
- `disableModule`

### Endpoints

#### List Telesales Leads

```http
GET /api/telesales/leads
```

Query params المتوقعة:

```text
page
per_page
scope=all|my
search
stage
display_stage[]
referral_only=true|false
assigned_to
source
date_from
date_to
```

Response يرجع paginator Laravel وفي كل lead fields إضافية:

```json
{
  "id": 123,
  "name": "Lead Name",
  "phone": "01000000000",
  "workflow_key": "telesales",
  "display_stage": "Fresh",
  "display_stage_key": "fresh",
  "assigned_to_name": "Agent Name",
  "convert_by_name": "Telesales User",
  "convert_to_name": "Sales User",
  "permissions": {
    "...": true
  }
}
```

#### Dashboard Summary

```http
GET /api/telesales/dashboard-summary
```

Query params:

```text
scope=all|my
referral_only=true|false
search
display_stage[]
date_from
date_to
```

Response shape مختصر:

```json
{
  "total_leads": 0,
  "assigned_to_sales": 0,
  "by_stage": [],
  "follow_ups_today": 0,
  "calls_today": 0
}
```

#### Assignees

```http
GET /api/telesales/assignees?workflow=telesales
GET /api/telesales/assignees?workflow=sales
```

Response:

```json
[
  {
    "id": 1,
    "name": "User Name",
    "role": "Telesales Agent",
    "job_title": "Agent",
    "manager_id": 2,
    "status": "active"
  }
]
```

#### Bulk Assign داخل Telesales

```http
POST /api/telesales/leads/bulk-assign
```

Body:

```json
{
  "lead_ids": [1, 2, 3],
  "assigned_to": 10,
  "assign_role": "sales",
  "method": "fresh",
  "options": {
    "sameStage": false,
    "clearHistory": false
  }
}
```

القيم:

- `assign_role`: `sales` أو `manager`
- `method`: `fresh` أو `cold_call`

#### Transfer To Sales

```http
POST /api/telesales/leads/{leadId}/transfer-to-sales
```

Body:

```json
{
  "assignment_method": "direct",
  "assigned_to": 12,
  "assign_role": "sales",
  "stage": "new_lead",
  "history_option": "keep_history"
}
```

القيم:

- `assignment_method`: `direct` أو `rotation`
- `stage`: `same_stage` أو `new_lead` أو `cold_calls`
- `history_option`: `keep_history` أو `assign_as_new`
- عند `assignment_method=rotation` يمكن عدم إرسال `assigned_to`.

#### Bulk Transfer To Sales

```http
POST /api/telesales/leads/bulk-transfer-to-sales
```

Body:

```json
{
  "lead_ids": [1, 2, 3],
  "all_active": false,
  "assignment_method": "direct",
  "assigned_to": 12,
  "stage": "new_lead",
  "history_option": "keep_history"
}
```

لو `all_active=true` لا تحتاج إرسال `lead_ids`.

#### Historical Telesales

```http
GET /api/telesales/historical
```

Query params:

```text
page
per_page
scope=all|my
search
converted_only=true|false
```

#### Module Disable Check

```http
GET /api/telesales/module-disable-check
```

Response:

```json
{
  "active_leads_count": 5,
  "sample_leads": [],
  "can_bulk_transfer": true
}
```

## 2. Telesales Stages

استخدم endpoint الـ stages الحالي مع workflow:

```http
GET /api/stages?workflow_key=telesales&active_only=1
```

في Telesales يوجد stages ثابتة/أساسية مثل:

- `fresh`
- `duplicate`
- `pending`
- `cold calls`

وأي stages ديناميكية من الإعدادات.

## 3. Not Interest Reasons

دي مرتبطة بـ Telesales؛ لا تظهر في Android إلا لو `telesales` مفعّل.

### List

```http
GET /api/not-interest-reasons
```

### Create

```http
POST /api/not-interest-reasons
```

Body:

```json
{
  "name": "Budget issue",
  "name_ar": "مشكلة ميزانية",
  "is_active": true
}
```

### Update

```http
PUT /api/not-interest-reasons/{id}
```

Body:

```json
{
  "name": "Not ready",
  "name_ar": "غير جاهز",
  "is_active": true
}
```

### Usage

```http
GET /api/not-interest-reasons/{id}/usage
```

### Replace And Delete

```http
POST /api/not-interest-reasons/{id}/replace-and-delete
```

Body:

```json
{
  "replacement_id": 2
}
```

### Delete

```http
DELETE /api/not-interest-reasons/{id}
```

## 4. Lead Actions — Meeting Updates

عند إضافة Action من نوع meeting:

```http
POST /api/lead-actions
```

Body مثال لترتيب اجتماع:

```json
{
  "lead_id": 123,
  "type": "meeting",
  "next_action_type": "meeting",
  "stage_id": 5,
  "date": "2026-07-23",
  "time": "14:00",
  "meeting_status": "scheduled",
  "meetingType": "offline",
  "meetingLocation": "Office",
  "notes": "Meeting arranged"
}
```

Body مثال لإغلاق الاجتماع كـ Done:

```json
{
  "lead_id": 123,
  "type": "meeting",
  "next_action_type": "meeting",
  "meeting_status": "done",
  "notes": "Client attended"
}
```

Body مثال لإغلاق الاجتماع كـ Missed/No Show:

```json
{
  "lead_id": 123,
  "type": "meeting",
  "next_action_type": "meeting",
  "meeting_status": "no_show",
  "notes": "Client did not attend"
}
```

القيم المدعومة:

- `scheduled`
- `done`
- `no_show`
- `cancelled`

قواعد مهمة:

- لا يمكن عمل meeting جديدة `scheduled` لو فيه meeting مفتوحة لنفس الليد.
- لا يمكن تسجيل `done` أو `no_show` بدون meeting مفتوحة `scheduled` أولًا.
- بعد إغلاق meeting كـ `done` أو `no_show` لا يتم تغيير النتيجة إلا بصلاحية manager/correction.
- `meeting_status` يظهر داخل `action.details.meeting_status`.

## 5. Convert Lead To Customer — Real Estate

في tenant Real Estate، تحويل الليد لكاستومر يحتاج اختيار وحدة.

### Load Projects

```http
GET /api/projects
```

### Load Available Units

```http
GET /api/properties?fields=dropdown
```

على Android فلتر الوحدات محليًا كمان:

```text
status == null OR lower(status) == "available"
```

لا تعرض وحدات:

- `reserved`
- `sold`
- `rented`
- `contracted`
- `booked`
- `hold`
- `unavailable`

### Convert

```http
POST /api/cc/leads/{leadId}/convert-to-customer
```

Body الجديد:

```json
{
  "property_id": 55
}
```

مهم:

- لا ترسل `payment_plan` في نافذة التحويل.
- لو tenant `general` أو غير real estate، التحويل ممكن يفضل مباشر بدون اختيار وحدة حسب flow التطبيق.
- Backend يمنع اختيار وحدة غير available حتى لو اتبعتت بالغلط.

## 6. Properties / Unit Code

عند إنشاء property:

```http
POST /api/properties
```

تعديل جديد:

- لو `unit_code` فارغ والسيستم auto-generate مفعّل، backend يولد كود جديد آمن.
- الكود القديم/المستخدم قبل كده لا يتم إعادة استخدامه.
- لو ظهرت `422` برسالة `This unit code was used before and cannot be reused`، اعرضها للمستخدم كخطأ validation.

## 7. Real Estate Requests

في شاشة Real Estate Requests:

- عمود `type` يعرض `Unit` بدل `Booking`.
- لو API رجع `Booking`، اعرضها في Android كـ `Unit`.

Mapping:

```kotlin
fun displayRequestType(type: String?): String {
    return if (type?.trim()?.lowercase() == "booking") "Unit" else (type ?: "-")
}
```

## 8. Navigation Rules For Android

### Hide completely if module disabled

لو `enabled_modules` لا يحتوي `telesales`:

- أخفِ Telesales Dashboard.
- أخفِ All/My/Referral Telesales Leads.
- أخفِ Add Telesales Lead.
- أخفِ Telesales Stages.
- أخفِ Telesales Reports.
- أخفِ Historical Telesales.
- أخفِ Not Interest Reasons.

### Keep visible

- `Cancel Reasons` ليس مربوطًا بـ Telesales؛ يظل حسب صلاحيات settings/configuration.

## 9. Production Deployment Info

- آخر deploy تم: `2026-07-22`
- Commit المرفوع: `26b8c249`
- Backend migrations الجديدة اشتغلت على production.
- Frontend build تم داخل Docker على production.

