# شرح Delay Leads و Convert Lead To Customer

## 1. Delay Leads لما الـ action يكون Meeting

الـ `delay lead` بيتحدد بناءً على **آخر action مفتوح** على الليد، وليس بناءً على اسم المرحلة فقط.

الليد يعتبر `delayed` لما يتحقق الآتي:

- يكون آخر `action` ما زال مفتوحًا.
- تكون قيمة `details.status` من الحالات المفتوحة مثل:
  - `scheduled`
  - `pending`
  - `in_progress`
- يكون الـ action فيه `date` و `time`.
- يكون وقت التنفيذ المحدد عدى، ومعه سماحية دقيقة واحدة.

### في حالة الـ Meeting

الـ `meeting` في السيستم ليست module منفصل، لكنها `lead action` عادية ومعها:

- `type = meeting` أو `next_action_type = meeting`
- `meeting_status`
- `date`
- `time`

حالات الـ `meeting_status` المدعومة:

- `scheduled`
- `done`
- `no_show`
- `cancelled`

### السلوك المطلوب فهمه

- لو الـ `meeting_status = scheduled` وميعاد الـ meeting عدى، فالليد يظهر ضمن `delay leads`.
- لو الـ meeting اتقفلت كـ:
  - `done`
  - `no_show`
  - `cancelled`
  فلا تُعتبر delayed.
- لو اتضاف action جديد بعد action قديم متأخر، الـ action القديم بيتحوّل إلى `superseded`، وبالتالي الليد يخرج من delayed بناءً على الـ action القديم.

### الخلاصة العملية للأندرويد

- الاعتماد يكون على **آخر action مفتوح له `date/time`**.
- لو هو `meeting` وما زال `scheduled` ووقته عدى، اعتبره delayed.
- لا تعتمد فقط على stage name، لأن الحكم الحقيقي من حالة الـ action نفسها.

## 2. Convert Lead To Customer لما company type يكون General

في حالة `company_type = general`، التحويل من `lead` إلى `customer` يكون **مباشر**، وليس مشروطًا باختيار وحدة.

### السلوك الحالي

- يتم استدعاء:

```http
POST /api/cc/leads/{leadId}/convert-to-customer
```

- الـ backend ينشئ `customer` من بيانات الـ lead نفسها، مثل:
  - `name`
  - `phone`
  - `email`
  - `source`
  - `assigned_to`

### هل `property_id` مطلوب؟

- لا، ليس مطلوبًا في الـ general flow.
- لو لم يتم إرسال `property_id`، والـ lead أصلًا غير مربوط بوحدة، يتم إنشاء `customer` فقط.
- في هذه الحالة قد لا يتم إنشاء:
  - `customer_unit`
  - `payment_plan`

### متى يتم إنشاء customer unit؟

- لو تم إرسال `property_id`
- أو لو الـ lead نفسه مربوط مسبقًا بوحدة يمكن للباك إند التعرف عليها

ساعتها الـ backend قد ينشئ:

- `customer_unit`
- وحالته تكون `reserved`
- وقد ينشئ `payment_plan` إذا توفرت بيانات مناسبة

## 3. رسالة مختصرة مناسبة لمهندس الأندرويد

```text
بالنسبة للـ delay leads، الليد بيتحسب delayed على أساس آخر action مفتوح عليه، مش على أساس اسم الـ stage فقط. لو آخر action حالته المفتوحة زي scheduled / pending / in_progress وفيه date و time وميعاده عدى بدقيقة أو أكثر، ساعتها الليد يظهر delayed.

ولو الـ action دي meeting، فطالما الـ meeting_status = scheduled ولسه ما اتقفلتش، وبعد وقتها عدى، فهي تعتبر delayed. لكن لو الـ meeting اتقفلت done أو no_show أو cancelled فهي ما تبقاش delayed. وكمان لو اتضاف action جديد، الـ action القديم المتأخر بيتعتبر superseded ومابيحسبش delay بعد كده.

وبالنسبة لـ convert lead to customer في حالة company type = general، فالتحويل direct ومش لازم يختار unit. يعني يقدر يضرب convert-to-customer عادي بدون property_id، والباك هيعمل customer من بيانات الـ lead. أما customer_unit أو payment_plan فدول بيتعملوا فقط لو فيه property_id أو لو الليد نفسه مربوط بوحدة من قبل.
```
