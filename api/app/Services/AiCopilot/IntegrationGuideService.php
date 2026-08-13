<?php

namespace App\Services\AiCopilot;

class IntegrationGuideService
{
    public function resolve(string $message, string $locale = 'en'): ?array
    {
        $text = $this->normalize($message);

        if (! $this->looksLikeIntegrationHelp($text)) {
            return null;
        }

        $type = $this->detectType($text);

        if ($type === null) {
            return $this->buildChooser($locale);
        }

        return $this->buildGuide($type, $locale);
    }

    private function looksLikeIntegrationHelp(string $text): bool
    {
        $hasIntegrationWord = preg_match('/(integration|integrations|connect|setup|configure|webhook|api|ربط|اربط|اوصل|وصل|تكامل|انتجريشن|اعداد|إعداد|ازاي|كيف)/u', $text);
        $hasKnownChannel = preg_match('/(meta|facebook|فيسبوك|ميتا|whatsapp|واتساب|واتس|website|web\s*site|webchat|web\s*chat|موقع|ويبسايت|ويب شات|tenant\s*app|custom\s*app|own\s*app|تطبيق التينانت|تطبيق خاص|التطبيق الخاص)/u', $text);

        return (bool) (
            ($hasIntegrationWord && $hasKnownChannel)
            || preg_match('/(شرح|اشرح).{0,30}(integration|integrations|تكامل|انتجريشن|الربط)/u', $text)
            || preg_match('/(integration|integrations|تكامل|انتجريشن).{0,30}(شرح|اشرح|help|guide)/u', $text)
        );
    }

    private function detectType(string $text): ?string
    {
        if (preg_match('/(whatsapp|واتساب|واتس)/u', $text)) {
            return 'whatsapp';
        }

        if (preg_match('/(website|web\s*site|webchat|web\s*chat|موقع|ويبسايت|ويب شات)/u', $text)) {
            return 'website';
        }

        if (preg_match('/(meta|facebook|فيسبوك|ميتا|lead\s*ads|ليد ادز|tenant\s*app|custom\s*app|own\s*app|تطبيق التينانت|تطبيق خاص|التطبيق الخاص)/u', $text)) {
            return 'meta';
        }

        return null;
    }

    private function buildChooser(string $locale): array
    {
        if ($locale === 'ar') {
            return [
                'ok' => true,
                'type' => 'chooser',
                'title' => 'اختار نوع الربط',
                'message' => implode("\n", [
                    'تحب أشرحلك ربط أي Integration؟',
                    '',
                    '• Meta / Facebook Lead Ads',
                    '• WhatsApp Business',
                    '• Website leads / WebChat',
                    '',
                    'اكتب مثلا: اشرح ربط واتساب، أو ازاي أربط Meta.',
                ]),
                'requirements' => [],
                'steps' => [],
                'troubleshooting' => [],
                'follow_up_questions' => ['تحب نبدأ بـ Meta ولا WhatsApp ولا Website؟'],
                'ui_actions' => $this->actions($locale),
                'locale' => 'ar',
            ];
        }

        return [
            'ok' => true,
            'type' => 'chooser',
            'title' => 'Choose an integration',
            'message' => implode("\n", [
                'Which integration should I walk you through?',
                '',
                '• Meta / Facebook Lead Ads',
                '• WhatsApp Business',
                '• Website leads / WebChat',
                '',
                'For example: explain WhatsApp setup, or how do I connect Meta.',
            ]),
            'requirements' => [],
            'steps' => [],
            'troubleshooting' => [],
            'follow_up_questions' => ['Should we start with Meta, WhatsApp, or Website?'],
            'ui_actions' => $this->actions($locale),
            'locale' => 'en',
        ];
    }

    private function buildGuide(string $type, string $locale): array
    {
        $guides = $locale === 'ar' ? $this->arabicGuides() : $this->englishGuides();
        $guide = $guides[$type];

        $guide['ok'] = true;
        $guide['type'] = $type;
        $guide['ui_actions'] = $this->actions($locale, $type);
        $guide['locale'] = $locale === 'ar' ? 'ar' : 'en';
        $guide['message'] = $this->composeMessage($guide, $guide['locale']);

        return $guide;
    }

    private function composeMessage(array $guide, string $locale): string
    {
        $lines = [
            (string) $guide['title'],
            '',
            $locale === 'ar' ? 'المتطلبات:' : 'Requirements:',
        ];

        foreach ($guide['requirements'] as $item) {
            $lines[] = '• '.$item;
        }

        $lines[] = '';
        $lines[] = $locale === 'ar' ? 'خطوات الربط:' : 'Setup steps:';
        foreach ($guide['steps'] as $index => $item) {
            $lines[] = ((int) $index + 1).'. '.$item;
        }

        $lines[] = '';
        $lines[] = $locale === 'ar' ? 'لو حصلت مشكلة:' : 'Troubleshooting:';
        foreach ($guide['troubleshooting'] as $item) {
            $lines[] = '• '.$item;
        }

        $question = $guide['follow_up_questions'][0] ?? null;
        if (is_string($question) && trim($question) !== '') {
            $lines[] = '';
            $lines[] = $question;
        }

        return implode("\n", $lines);
    }

    private function actions(string $locale, ?string $selected = null): array
    {
        $labels = $locale === 'ar'
            ? [
                'meta' => 'افتح Meta Integration',
                'whatsapp' => 'افتح WhatsApp Integration',
                'website' => 'افتح Website Integration',
            ]
            : [
                'meta' => 'Open Meta Integration',
                'whatsapp' => 'Open WhatsApp Integration',
                'website' => 'Open Website Integration',
            ];

        $paths = [
            'meta' => '/marketing/meta-integration',
            'whatsapp' => '/settings/integrations/whatsapp',
            'website' => '/marketing/meta-integration?integration=website',
        ];

        $keys = $selected ? [$selected] : ['meta', 'whatsapp', 'website'];

        return array_map(fn (string $key) => [
            'type' => 'navigate',
            'path' => $paths[$key],
            'pathname' => strtok($paths[$key], '?') ?: $paths[$key],
            'label' => $labels[$key],
            'group' => 'integrations',
        ], $keys);
    }

    private function arabicGuides(): array
    {
        return [
            'meta' => [
                'title' => 'شرح ربط Meta / Facebook Lead Ads',
                'requirements' => [
                    'حساب Facebook بصلاحية Admin على الصفحة والـ Business Manager.',
                    'صلاحية الوصول للـ Ad Account والـ Lead Forms المطلوبة.',
                    'فتح صفحة Marketing > Meta Integration من داخل السيستم.',
                    'اختيار وضع الربط: Shared App الخاص بالمنصة أو Custom App الخاص بالتينانت.',
                ],
                'steps' => [
                    'افتح Marketing > Meta Integration.',
                    'لو هتستخدم تطبيق المنصة، سيب Connection Mode على Shared App. ده مناسب لمعظم التينانتس لأن App ID والـ webhook متضبطين من Super Admin.',
                    'لو التينانت عنده تطبيق Meta خاص به، افتح Connection Mode واختار Custom App.',
                    'في Custom App أدخل App ID وApp Secret، وسيب أو عدّل Verify Token. السيستم هيطلع لك Webhook URL خاص بالتينانت بالشكل /api/meta/webhook/{webhook_key}.',
                    'افتح Meta Developer Console للتطبيق الخاص بالتينانت، ثم Facebook Login واضف OAuth Redirect URI: /api/auth/meta/callback.',
                    'في Webhooks داخل Meta Developer Console اضف Callback URL الخاص بالتينانت وVerify Token الظاهر في السيستم، واشترك في Page field باسم leadgen.',
                    'ارجع للسيستم واضغط Connect Meta أو Add New Account وسجل دخول بحساب Facebook المسؤول.',
                    'اختار Business Manager والصفحات والـ Ad Accounts المطلوبة، ووافق على الصلاحيات.',
                    'بعد الرجوع للسيستم، فعّل الصفحات المطلوبة واعمل Sync. السيستم هيحاول يعمل subscribe للصفحة على leadgen تلقائيا.',
                    'اعمل Test Webhook ثم Test Lead أو اسحب ليد حديث للتأكد إن الليد دخل CRM مربوط بالتينانت الصحيح.',
                ],
                'troubleshooting' => [
                    'لو الصفحة مش ظاهرة، تأكد إن الحساب Admin على الصفحة والبيزنس.',
                    'لو Custom App مش جاهز، راجع إن App ID وApp Secret موجودين وإن Verify Token محفوظ.',
                    'لو OAuth فشل، تأكد إن /api/auth/meta/callback مضاف في Valid OAuth Redirect URIs داخل تطبيق التينانت.',
                    'لو Webhook verification فشل، طابق Callback URL الخاص بالتينانت وVerify Token حرفيا.',
                    'لو الليدز مش بتوصل، راجع صلاحيات leads_retrieval وpages_manage_metadata وWebhook subscription للـ leadgen.',
                    'لو غيرت من Shared إلى Custom أو غيرت App credentials، لازم تعمل reconnect لأن السيستم بيعلّم الاتصال needs_reauth.',
                    'واتساب لا يستخدم تطبيق التينانت الخاص بليد أدز؛ WhatsApp Cloud API ما زال على Shared Meta App حسب تصميم السيستم الحالي.',
                ],
                'follow_up_questions' => ['هتربط Meta عن طريق Shared App ولا تطبيق خاص بالتينانت؟'],
            ],
            'whatsapp' => [
                'title' => 'شرح ربط WhatsApp Business',
                'requirements' => [
                    'رقم WhatsApp Business جاهز وغير مربوط بتطبيق واتساب عادي لو هتستخدم Cloud API.',
                    'WhatsApp Business Account داخل Meta Business Manager أو مزود Mirror متاح.',
                    'صلاحية Admin لإعداد القنوات والقوالب.',
                ],
                'steps' => [
                    'افتح Settings ثم Integrations ثم WhatsApp.',
                    'اختار طريقة الربط: Meta Cloud API أو WhatsApp Mirror حسب المتاح.',
                    'في Meta Cloud API، اربط الحساب أو أدخل Phone Number ID وWABA ID وAccess Token.',
                    'اضبط Webhook URL وVerify Token من السيستم داخل Meta عند الحاجة.',
                    'احفظ الإعدادات ثم اختار القناة الأساسية.',
                    'ابعث رسالة Test وتأكد من الإرسال والاستقبال داخل محادثات الليد.',
                ],
                'troubleshooting' => [
                    'لو الإرسال فشل، راجع Access Token وPhone Number ID.',
                    'لو الاستقبال مش شغال، راجع Webhook callback وVerify Token.',
                    'لو القوالب مش ظاهرة، اعمل Sync للقوالب وتأكد إنها Approved.',
                ],
                'follow_up_questions' => ['هتربط WhatsApp عن طريق Meta Cloud API ولا Mirror؟'],
            ],
            'website' => [
                'title' => 'شرح ربط Website Leads / WebChat',
                'requirements' => [
                    'رابط الموقع الحقيقي واسم واضح للاتصال.',
                    'صلاحية إدارة Website Integration داخل السيستم.',
                    'إمكانية إضافة كود JavaScript أو form handler في الموقع.',
                ],
                'steps' => [
                    'افتح Marketing ثم Integrations ثم Website.',
                    'أنشئ Website Connection جديد باسم الموقع والرابط.',
                    'اضبط Allowed Origins بدومين الموقع الحقيقي.',
                    'انسخ كود الـ snippet أو endpoint من السيستم.',
                    'ضع الكود في الموقع قبل نهاية body أو اربط الفورم بالـ API endpoint.',
                    'استخدم Test Connection وتابع Intake Logs للتأكد إن الليد وصل.',
                ],
                'troubleshooting' => [
                    'لو الطلب مرفوض، راجع Allowed Origins والدومين بالبروتوكول الصحيح.',
                    'لو الليد مش بيتسجل، راجع الحقول المطلوبة مثل الاسم أو الموبايل.',
                    'لو التغيير مش ظاهر، امسح cache الموقع أو CDN وجرب من نافذة جديدة.',
                ],
                'follow_up_questions' => ['موقعك static HTML ولا React/WordPress ولا فورم مخصص؟'],
            ],
        ];
    }

    private function englishGuides(): array
    {
        return [
            'meta' => [
                'title' => 'Meta / Facebook Lead Ads setup',
                'requirements' => [
                    'A Facebook account with Admin access to the Page and Business Manager.',
                    'Access to the target Ad Account and Lead Forms.',
                    'Access to Marketing > Meta Integration in the CRM.',
                    'A selected connection mode: platform Shared App or tenant-owned Custom App.',
                ],
                'steps' => [
                    'Open Marketing > Meta Integration.',
                    'For the platform app path, keep Connection Mode on Shared App. This is the default path managed by Super Admin.',
                    'For a tenant-owned Meta app, open Connection Mode and choose Custom App.',
                    'Enter the tenant App ID and App Secret, then keep or set the Verify Token. The CRM will show a tenant-specific webhook URL like /api/meta/webhook/{webhook_key}.',
                    'In the tenant Meta Developer Console, add /api/auth/meta/callback under Facebook Login valid OAuth redirect URIs.',
                    'In Webhooks, set the tenant-specific Callback URL and matching Verify Token, then subscribe the Page field leadgen.',
                    'Back in the CRM, click Connect Meta or Add New Account and sign in with the Facebook admin account.',
                    'Select the Business Manager, Pages, and Ad Accounts, then approve the requested permissions.',
                    'Activate the required Pages and run Sync. The CRM will try to subscribe active Pages to leadgen automatically.',
                    'Run Test Webhook, then send a Test Lead or sync a recent lead to confirm leads enter the correct tenant.',
                ],
                'troubleshooting' => [
                    'If a Page is missing, confirm the account is Admin on both the Page and Business.',
                    'If Custom App is not ready, confirm App ID, App Secret, and Verify Token are saved.',
                    'If OAuth fails, confirm /api/auth/meta/callback is allowlisted on the tenant app.',
                    'If webhook verification fails, match the tenant Callback URL and Verify Token exactly.',
                    'If leads do not arrive, check leads_retrieval, pages_manage_metadata, and leadgen webhook subscription.',
                    'After switching Shared App to Custom App or changing app credentials, reconnect Facebook because existing connections are marked needs_reauth.',
                    'WhatsApp does not use the tenant Lead Ads app; WhatsApp Cloud API still uses the shared Meta App in the current system design.',
                ],
                'follow_up_questions' => ['Will this tenant use the Shared App or its own Custom Meta App?'],
            ],
            'whatsapp' => [
                'title' => 'WhatsApp Business setup',
                'requirements' => [
                    'A WhatsApp Business number ready for Cloud API, or an available Mirror provider.',
                    'A WhatsApp Business Account in Meta Business Manager when using Cloud API.',
                    'Admin access to configure channels and templates.',
                ],
                'steps' => [
                    'Open Settings, then Integrations, then WhatsApp.',
                    'Choose Meta Cloud API or WhatsApp Mirror based on your setup.',
                    'For Meta Cloud API, connect the account or enter Phone Number ID, WABA ID, and Access Token.',
                    'Configure the Webhook URL and Verify Token in Meta when needed.',
                    'Save settings and select the primary channel.',
                    'Send a test message and confirm inbound replies appear inside lead conversations.',
                ],
                'troubleshooting' => [
                    'If sending fails, check the Access Token and Phone Number ID.',
                    'If inbound messages do not arrive, check the webhook callback and Verify Token.',
                    'If templates are missing, sync templates and confirm they are Approved.',
                ],
                'follow_up_questions' => ['Are you connecting WhatsApp through Meta Cloud API or Mirror?'],
            ],
            'website' => [
                'title' => 'Website Leads / WebChat setup',
                'requirements' => [
                    'The live website URL and a clear connection name.',
                    'Permission to manage Website Integration in the CRM.',
                    'Ability to add JavaScript or a form handler to the website.',
                ],
                'steps' => [
                    'Open Marketing, then Integrations, then Website.',
                    'Create a Website Connection with the website name and URL.',
                    'Set Allowed Origins to the real website domain.',
                    'Copy the generated snippet or endpoint from the CRM.',
                    'Install the snippet before the closing body tag or connect your form to the API endpoint.',
                    'Run Test Connection and review Intake Logs to confirm the lead arrived.',
                ],
                'troubleshooting' => [
                    'If requests are rejected, verify Allowed Origins and the exact protocol/domain.',
                    'If a lead is not created, check required fields such as name or phone.',
                    'If changes do not appear, clear website/CDN cache and retry in a fresh window.',
                ],
                'follow_up_questions' => ['Is your website static HTML, React/WordPress, or a custom form?'],
            ],
        ];
    }

    private function normalize(string $message): string
    {
        $text = mb_strtolower(trim($message));
        $text = str_replace(['أ', 'إ', 'آ'], 'ا', $text);

        return preg_replace('/\s+/u', ' ', $text) ?? $text;
    }
}
