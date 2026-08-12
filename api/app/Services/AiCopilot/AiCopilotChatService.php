<?php

namespace App\Services\AiCopilot;

use App\Models\AiCopilotConversation;
use App\Models\AiCopilotMessage;
use App\Models\Item;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Str;

class AiCopilotChatService
{
    use UserHierarchyTrait;
    public function __construct(
        private readonly AiSystemCatalog $catalog,
        private readonly AiCopilotToolExecutor $tools
    ) {
    }

    public function chat(User $user, string $message, ?int $conversationId = null, ?string $preferredLocale = null): array
    {
        $conversation = $this->resolveConversation($user, $conversationId);
        $this->storeMessage($conversation, 'user', $message);
        $locale = $this->detectReplyLocale($message, $preferredLocale);

        $toolResult = null;
        $uiActions = [];
        $assistantText = '';
        $planned = ['tool' => null, 'args' => []];
        $pendingLeadDraft = $this->resolvePendingLeadDraft($conversation);
        $pendingOptionalLeadDraft = $this->resolvePendingOptionalLeadDraft($conversation);
        $pendingActionDraft = $this->resolvePendingLeadActionDraft($conversation);
        $optionalStartDraft = $this->shouldStartOptionalLeadDraft($conversation, $message);
        $focusReply = $this->handleLeadFocusIntent($user, $conversation, $message, $locale);

        if ($focusReply) {
            $assistantText = $focusReply['message'];
            $uiActions = $focusReply['ui_actions'] ?? [];
        } else {
            $actionRestartArgs = $this->buildLeadActionRestartArgs($conversation, $message);
            $actionStartOverride = null;
            if ($pendingActionDraft && $this->looksLikeCreateLeadActionRequest($message)) {
                $candidateStart = $this->buildLeadActionWizardStartArgs($message, $user, $locale, $conversation);
                if (! empty($candidateStart['lead_id'])) {
                    $actionStartOverride = $candidateStart;
                }
            }

            if ($actionRestartArgs) {
                $planned = [
                    'tool' => 'create_lead_action_draft',
                    'args' => $actionRestartArgs,
                ];
            } elseif ($actionStartOverride) {
                $planned = [
                    'tool' => 'create_lead_action_draft',
                    'args' => $actionStartOverride,
                ];
            } elseif ($pendingActionDraft) {
                $planned = [
                    'tool' => 'create_lead_action_draft',
                    'args' => $this->mergePendingLeadActionDraftArgs($pendingActionDraft, $message, $user, $locale, $conversation),
                ];
            } elseif ($pendingOptionalLeadDraft) {
                $planned = [
                    'tool' => 'create_lead_draft',
                    'args' => $this->mergePendingOptionalLeadDraftArgs($pendingOptionalLeadDraft, $message),
                ];
            } elseif ($optionalStartDraft) {
                $planned = [
                    'tool' => 'create_lead_draft',
                    'args' => $this->buildOptionalLeadStartArgs($optionalStartDraft),
                ];
            } elseif ($pendingLeadDraft) {
                $planned = [
                    'tool' => 'create_lead_draft',
                    'args' => $this->mergePendingLeadDraftArgs($pendingLeadDraft, $message),
                ];
            } else {
                $forcedDelayed = $this->forceDelayedLeadsPlan($message);
                if ($forcedDelayed) {
                    $planned = $forcedDelayed;
                } elseif ($this->looksLikeAvailableReportsRequest($message)) {
                    $planned = [
                        'tool' => 'list_reports',
                        'args' => [],
                    ];
                } elseif ($this->looksLikeCreateLeadActionRequest($message)) {
                    $planned = [
                        'tool' => 'create_lead_action_draft',
                        'args' => $this->buildLeadActionWizardStartArgs($message, $user, $locale, $conversation),
                    ];
                } elseif ($this->looksLikeCreateTaskRequest($message) && preg_match('/\b(\d+)\b/', $message, $taskMatch)) {
                    $planned = [
                        'tool' => 'create_task_for_lead',
                        'args' => [
                            'lead_id' => (int) $taskMatch[1],
                            'title' => 'Follow up delayed lead #'.$taskMatch[1],
                        ],
                    ];
                } else {
                    $planned = $this->planWithGemini($user, $message, $locale);
                    if (! $planned) {
                        $planned = $this->planWithHeuristics($message, $user);
                    } else {
                        $planned = $this->enrichPlanWithHeuristicDates($planned, $message);
                $planned = $this->enrichPlanWithHeuristicFilters($planned, $message, $user);
                    $planned = $this->enrichPlanWithHeuristicFilters($planned, $message, $user);
                        $planned = $this->sanitizeLeadActionPlan($planned, $message, $user, $locale, $conversation);
                    }
                }
            }

            if (in_array(($planned['tool'] ?? null), ['navigate_report', 'export_report', 'build_report_filters'], true)) {
                $planned = $this->enrichPlanWithHeuristicDates($planned, $message);
                $planned = $this->enrichPlanWithHeuristicFilters($planned, $message, $user);
            }

            if (($planned['tool'] ?? null) && $planned['tool'] !== 'none') {
                $toolArgs = array_merge($planned['args'] ?? [], ['_locale' => $locale]);
                $toolResult = $this->tools->execute($user, $planned['tool'], $toolArgs);
                $uiActions = $toolResult['ui_actions'] ?? [];
                $assistantText = $this->composeToolReply($planned['tool'], $toolResult, $message, $locale);
                $this->storeMessage($conversation, 'tool', $assistantText, $planned['tool'], $toolResult, $uiActions);
            } else {
                $assistantText = $planned['reply']
                    ?? $this->defaultReply($user, $message, $locale);
            }
        }

        $this->storeMessage($conversation, 'assistant', $assistantText, null, null, $uiActions);

        if ($conversation) {
            $conversation->update([
                'title' => $conversation->title ?: Str::limit($message, 60),
                'last_message_at' => now(),
            ]);
        }

        return [
            'conversation_id' => $conversation?->id,
            'message' => $assistantText,
            'tool' => $planned['tool'] ?? null,
            'tool_result' => $toolResult,
            'ui_actions' => $uiActions,
            'locale' => $locale,
        ];
    }

    protected function detectReplyLocale(string $message, ?string $preferredLocale = null): string
    {
        if (preg_match('/\p{Arabic}/u', $message)) {
            return 'ar';
        }

        if (preg_match('/[A-Za-z]{3,}/u', $message)) {
            return 'en';
        }

        return $this->catalog->normalizeLocale($preferredLocale ?: 'en');
    }

    protected function resolveConversation(User $user, ?int $conversationId): ?AiCopilotConversation
    {
        if (! Schema::hasTable('ai_copilot_conversations')) {
            return null;
        }

        if ($conversationId) {
            $existing = AiCopilotConversation::query()
                ->where('id', $conversationId)
                ->where('user_id', $user->id)
                ->first();
            if ($existing) {
                return $existing;
            }
        }

        return AiCopilotConversation::create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'title' => null,
            'last_message_at' => now(),
        ]);
    }

    protected function storeMessage(
        ?AiCopilotConversation $conversation,
        string $role,
        ?string $content,
        ?string $toolName = null,
        ?array $toolPayload = null,
        ?array $uiActions = null
    ): void {
        if (! $conversation || ! Schema::hasTable('ai_copilot_messages')) {
            return;
        }

        AiCopilotMessage::create([
            'conversation_id' => $conversation->id,
            'role' => $role,
            'content' => $content,
            'tool_name' => $toolName,
            'tool_payload' => $toolPayload,
            'ui_actions' => $uiActions,
        ]);
    }

    protected function planWithGemini(User $user, string $message, string $locale = 'en'): ?array
    {
        $apiKey = (string) config('services.gemini.api_key', '');
        if ($apiKey === '') {
            return null;
        }

        $catalog = $this->catalog->forUser($user);
        $toolNames = implode(', ', array_column($this->tools->definitions(), 'name'));
        $reports = collect($catalog['reports'])->map(fn ($r) => $r['key'].' ('.$r['name'].')')->implode(', ');
        $modules = collect($catalog['modules'] ?? [])->map(fn ($m) => $m['key'].' ('.$m['name'].')')->implode(', ');
        $replyLanguage = $locale === 'ar' ? 'Arabic' : 'English';

        $prompt = <<<PROMPT
You are Besouhola Copilot, a CRM assistant.
Choose at most one tool for the user request, or none for a direct answer.
Available tools: {$toolNames}
Available modules for this user: {$modules}
Available reports for this user: {$reports}

Return ONLY JSON:
{"tool":"tool_name_or_none","args":{},"reply":"optional direct reply if tool is none"}

Language rule: any "reply" text MUST be written in {$replyLanguage}, matching the user message language.
When the user asks what they can do, what you can help with, or available capabilities, prefer tool "list_capabilities".
When the user asks to explain the system/CRM/overview, prefer tool "explain_feature" with args.topic="system".
When the user asks about a module (Leads, Reports, Tasks, Telesales, Marketing/Meta, Settings), prefer tool "explain_feature" with that module key.
When the user asks what reports they can open or which reports are available, prefer tool "list_reports".
When the user asks which leads to invest in, delayed leads, or overdue follow-ups, prefer tool "list_delayed_leads".
When the user is choosing/starting one lead after a delayed-leads list (e.g. "اختار واحد", "ابدأ بيها", "start with one"), do NOT open reports. Prefer tool "none" with a short reply asking them to click a lead card or name the lead id.
When the user wants to create/log a lead action (أكشن / follow-up / meeting outcome), prefer tool "create_lead_action_draft" with lead_id only when known. Do NOT invent stage_id, type, outcome, or description — the wizard asks what happened, then recommends a stage, then confirms.
When opening/filtering a report, set args.report to the exact report key from the available list.
When filtering reports, always put ISO dates in args as date_from and date_to (YYYY-MM-DD).
If the user writes dates like 1/8/2025 treat them as day/month/year.
Never invent a report or module that is not in the available lists.

User message:
{$message}
PROMPT;

        try {
            $response = Http::timeout(25)
                ->post($this->geminiGenerateContentUrl($apiKey), [
                    'contents' => [[
                        'role' => 'user',
                        'parts' => [['text' => $prompt]],
                    ]],
                ]);

            if (! $response->successful()) {
                return null;
            }

            $text = (string) data_get($response->json(), 'candidates.0.content.parts.0.text', '');
            $json = $this->extractJson($text);
            if (! is_array($json)) {
                return null;
            }

            return [
                'tool' => (string) ($json['tool'] ?? 'none'),
                'args' => is_array($json['args'] ?? null) ? $json['args'] : [],
                'reply' => isset($json['reply']) ? (string) $json['reply'] : null,
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    protected function forceDelayedLeadsPlan(string $message): ?array
    {
        $text = mb_strtolower($message);
        if (
            ! preg_match('/(delayed|delay|ديلاي|متأخر)/u', $text)
            && ! (preg_match('/(استثمر|invest)/u', $text) && preg_match('/(lead|ليد)/u', $text))
        ) {
            return null;
        }

        $workflow = preg_match('/telesales|تيلي/u', $text) ? 'telesales' : 'sales';

        return [
            'tool' => 'list_delayed_leads',
            'args' => ['workflow_key' => $workflow, 'limit' => 10],
        ];
    }

    protected function planWithHeuristics(string $message, ?User $user = null): array
    {
        $text = mb_strtolower($message);

        $forcedDelayed = $this->forceDelayedLeadsPlan($message);
        if ($forcedDelayed) {
            return $forcedDelayed;
        }

        if ($this->looksLikeLeadCreationRequest($text)) {
            return [
                'tool' => 'create_lead_draft',
                'args' => $this->guessLeadArgs($message),
            ];
        }

        if ($this->looksLikeCreateLeadActionRequest($message) || preg_match('/(action|follow[ -_]?up|meeting|comment|note|أكشن|اكشن)/u', $text)) {
            return [
                'tool' => 'create_lead_action_draft',
                'args' => $this->buildLeadActionWizardStartArgs($message, $user),
            ];
        }
        if (($this->looksLikeCreateTaskRequest($message) || preg_match('/(task|تاسك|مهمة)/u', $text)) && preg_match('/\b(\d+)\b/', $text, $m)) {
            return [
                'tool' => 'create_task_for_lead',
                'args' => [
                    'lead_id' => (int) $m[1],
                    'title' => 'Follow up delayed lead #'.$m[1],
                ],
            ];
        }

        if ($this->looksLikeAvailableReportsRequest($text)) {
            return [
                'tool' => 'list_reports',
                'args' => [],
            ];
        }

        if (
            preg_match('/(اشرح|شرح|explain|overview|وصف).{0,40}(السيستم|السيستيم|النظام|system|crm)/u', $text)
            || preg_match('/(explain|اشرح).{0,20}(the )?(system|crm)/u', $text)
            || preg_match('/(how does (the )?(system|crm) work)/u', $text)
        ) {
            return [
                'tool' => 'explain_feature',
                'args' => ['topic' => 'system'],
            ];
        }

        if (preg_match('/(اشرح|شرح|explain|what is|يعني ايه|ما هو)/u', $text)) {
            $module = $this->catalog->guessModuleKey($text);
            if ($module) {
                return [
                    'tool' => 'explain_feature',
                    'args' => ['topic' => $module],
                ];
            }
        }

        if (preg_match('/(export|download|تصدير|تحميل)/u', $text)) {
            $report = $this->guessReport($text) ?? 'leads_pipeline';

            return [
                'tool' => 'export_report',
                'args' => array_merge(['report' => $report], $this->guessDates($text)),
            ];
        }

        if (preg_match('/(report|تقرير|pipeline|pipeline|فلتر|filter|افتح|open)/u', $text)) {
            $report = $this->guessReport($text) ?? 'leads_pipeline';

            return [
                'tool' => 'navigate_report',
                'args' => array_merge(['report' => $report], $this->guessDates($text)),
            ];
        }

        if (preg_match('/(what can|capabilities|تقدر|اقدر|help|مساعد|features|ايه اللي اقدر|ايه اللي تقدر)/u', $text)) {
            return [
                'tool' => 'list_capabilities',
                'args' => [],
            ];
        }

        return [
            'tool' => 'explain_feature',
            'args' => ['topic' => Str::limit($message, 80)],
        ];
    }

    protected function guessReport(string $text): ?string
    {
        return $this->catalog->guessReportKey($text);
    }

    protected function looksLikeAvailableReportsRequest(string $text): bool
    {
        $normalized = mb_strtolower(trim($text));

        return (bool) preg_match(
            '/(what reports can i open|what reports|which reports|available reports|reports available|list reports|show reports|ايه التقارير|إيه التقارير|ما هي التقارير|التقارير المتاحة|اعرض التقارير|قائمة التقارير)/u',
            $normalized
        );
    }

    protected function enrichPlanWithHeuristicDates(array $planned, string $message): array
    {
        $tool = (string) ($planned['tool'] ?? '');
        if (! in_array($tool, ['navigate_report', 'export_report', 'build_report_filters'], true)) {
            return $planned;
        }

        $args = is_array($planned['args'] ?? null) ? $planned['args'] : [];
        $dates = $this->guessDates($message);

        foreach ($dates as $key => $value) {
            $args[$key] = $value;
        }

        $guessedReport = $this->guessReport($message);
        if ($guessedReport) {
            $args['report'] = $guessedReport;
        } elseif (! isset($args['report']) || $args['report'] === '') {
            $args['report'] = 'leads_pipeline';
        }

        if ($guessedReport && isset($args['report']) && $args['report'] !== $guessedReport) {
            $args['report'] = $guessedReport;
        }

        $planned['args'] = $args;

        return $planned;
    }

    protected function enrichPlanWithHeuristicFilters(array $planned, string $message, User $user): array
    {
        $tool = (string) ($planned['tool'] ?? '');
        if (! in_array($tool, ['navigate_report', 'export_report', 'build_report_filters'], true)) {
            return $planned;
        }

        $args = is_array($planned['args'] ?? null) ? $planned['args'] : [];
        $reportKey = (string) ($args['report'] ?? $this->guessReport($message) ?? 'leads_pipeline');

        if (empty($args['assigned_to'])) {
            $resolvedAssigneeId = $this->resolveReportAssigneeId($user, $message);
            if ($resolvedAssigneeId) {
                $args['assigned_to'] = $resolvedAssigneeId;
            }
        }

        if (empty($args['stage'])) {
            $resolvedStage = $this->resolveReportStageLabel($user, $message, $reportKey);
            if ($resolvedStage) {
                $args['stage'] = $resolvedStage;
            }
        }

        $planned['args'] = $args;

        return $planned;
    }

    protected function resolveReportAssigneeId(User $user, string $message): ?int
    {
        $normalizedText = $this->normalizeFilterMatchText($message);
        if ($normalizedText === '') {
            return null;
        }

        $query = User::query()->where('tenant_id', $user->tenant_id);
        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->whereIn('id', array_map('intval', (array) $viewableIds));
        }

        $users = $query->get(['id', 'name']);
        $bestId = null;
        $bestLen = 0;

        foreach ($users as $candidateUser) {
            $candidates = array_filter(array_unique([
                $this->normalizeFilterMatchText((string) ($candidateUser->name ?? '')),
                $this->normalizeFilterMatchText(strtok((string) ($candidateUser->name ?? ''), ' ')),
            ]));

            foreach ($candidates as $candidate) {
                if (mb_strlen($candidate) < 2) {
                    continue;
                }

                if (str_contains($normalizedText, $candidate) && mb_strlen($candidate) > $bestLen) {
                    $bestId = (int) $candidateUser->id;
                    $bestLen = mb_strlen($candidate);
                }
            }
        }

        return $bestId;
    }

    protected function resolveReportStageLabel(User $user, string $message, string $reportKey = 'leads_pipeline'): ?string
    {
        $normalizedText = $this->normalizeFilterMatchText($message);
        if ($normalizedText === '') {
            return null;
        }

        $workflowKey = $reportKey === 'sales_to_telesales' ? 'telesales' : 'sales';
        $stages = Stage::query()
            ->where('tenant_id', $user->tenant_id)
            ->where(function ($query) use ($workflowKey) {
                $query->whereNull('workflow_key')->orWhere('workflow_key', '')->orWhere('workflow_key', $workflowKey);
            })
            ->get(['name', 'name_ar', 'type']);

        $bestLabel = null;
        $bestLen = 0;

        foreach ($stages as $stage) {
            $aliases = array_filter(array_unique([
                $this->normalizeFilterMatchText((string) ($stage->name ?? '')),
                $this->normalizeFilterMatchText((string) ($stage->name_ar ?? '')),
                $this->normalizeFilterMatchText((string) ($stage->type ?? '')),
            ]));

            foreach ($aliases as $alias) {
                if (mb_strlen($alias) < 2) {
                    continue;
                }

                if (str_contains($normalizedText, $alias) && mb_strlen($alias) > $bestLen) {
                    $bestLabel = trim((string) ($stage->name ?? $stage->name_ar ?? $stage->type ?? ''));
                    $bestLen = mb_strlen($alias);
                }
            }
        }

        return $bestLabel ?: null;
    }

    protected function normalizeFilterMatchText(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['?', '?', '?', '?', '?', '_', '-'], ['?', '?', '?', '?', '?', ' ', ' '], $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    protected function guessDates(string $text): array
    {
        $args = [];
        $parsed = [];

        if (preg_match_all('/(\d{4}-\d{2}-\d{2})/u', $text, $isoMatches)) {
            foreach ($isoMatches[1] as $value) {
                $parsed[] = $value;
            }
        }

        if (preg_match_all('/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/u', $text, $slashMatches, PREG_SET_ORDER)) {
            foreach ($slashMatches as $match) {
                $day = (int) $match[1];
                $month = (int) $match[2];
                $year = (int) $match[3];

                if ($day <= 12 && $month > 12) {
                    [$day, $month] = [$month, $day];
                }

                if ($month < 1 || $month > 12 || $day < 1 || $day > 31) {
                    continue;
                }

                $parsed[] = sprintf('%04d-%02d-%02d', $year, $month, $day);
            }
        }

        $parsed = array_values(array_unique($parsed));

        if (count($parsed) >= 1) {
            $args['date_from'] = $parsed[0];
        }
        if (count($parsed) >= 2) {
            $args['date_to'] = $parsed[1];
        }

        // Relative phrases only when the user did not already give explicit dates.
        if ($parsed !== []) {
            return $args;
        }

        $lower = mb_strtolower($text);
        $today = now()->toDateString();

        // More specific relative ranges first.
        if (
            preg_match('/\blast\s*30\s*days?\b/u', $lower)
            || preg_match('/آخر\s*30\s*يوم/u', $text)
            || preg_match('/اخر\s*30\s*يوم/u', $text)
            || preg_match('/خلال\s*شهر/u', $text)
        ) {
            $args['date_from'] = now()->subDays(29)->toDateString();
            $args['date_to'] = $today;
        } elseif (
            preg_match('/\blast\s*7\s*days?\b/u', $lower)
            || preg_match('/\blast\s*week\b/u', $lower)
            || preg_match('/past\s*week/u', $lower)
            || preg_match('/آخر\s*7\s*أيام/u', $text)
            || preg_match('/اخر\s*7\s*ايام/u', $text)
            || preg_match('/آخر\s*أسبوع/u', $text)
            || preg_match('/اخر\s*اسبوع/u', $text)
            || preg_match('/الأسبوع\s*الماضي/u', $text)
            || preg_match('/الاسبوع\s*الماضي/u', $text)
        ) {
            $args['date_from'] = now()->subDays(6)->toDateString();
            $args['date_to'] = $today;
        } elseif (
            preg_match('/\byesterday\b/u', $lower)
            || preg_match('/أمس/u', $text)
            || preg_match('/امس/u', $text)
        ) {
            $yesterday = now()->subDay()->toDateString();
            $args['date_from'] = $yesterday;
            $args['date_to'] = $yesterday;
        } elseif (
            preg_match('/\btoday\b/u', $lower)
            || preg_match('/اليوم/u', $text)
        ) {
            $args['date_from'] = $today;
            $args['date_to'] = $today;
        } elseif (
            preg_match('/\bthis\s*month\b/u', $lower)
            || preg_match('/هذا\s*الشهر/u', $text)
            || preg_match('/الشهر\s*الحالي/u', $text)
        ) {
            $args['date_from'] = now()->startOfMonth()->toDateString();
            $args['date_to'] = $today;
        } elseif (
            preg_match('/\blast\s*month\b/u', $lower)
            || preg_match('/الشهر\s*الماضي/u', $text)
            || preg_match('/الشهر\s*اللي\s*فات/u', $text)
        ) {
            $args['date_from'] = now()->subMonthNoOverflow()->startOfMonth()->toDateString();
            $args['date_to'] = now()->subMonthNoOverflow()->endOfMonth()->toDateString();
        } elseif (
            preg_match('/\bthis\s*year\b/u', $lower)
            || preg_match('/هذه\s*السنة/u', $text)
            || preg_match('/السنة\s*الحالية/u', $text)
            || preg_match('/العام\s*الحالي/u', $text)
        ) {
            $args['date_from'] = now()->startOfYear()->toDateString();
            $args['date_to'] = $today;
        }

        return $args;
    }

    protected function composeToolReply(string $tool, array $result, string $message, string $locale = 'en'): string
    {
        if (! ($result['ok'] ?? false)) {
            $fallback = $locale === 'ar' ? 'معرفتش أكمل الطلب ده.' : 'I could not complete that request.';

            return (string) ($result['message'] ?? $fallback);
        }

        $locale = $this->catalog->normalizeLocale($result['locale'] ?? $locale);

        return match ($tool) {
            'list_capabilities' => (string) ($result['summary'] ?? (
                $locale === 'ar' ? 'دي الإمكانيات المتاحة.' : 'Here are the available capabilities.'
            )),
            'list_reports' => (string) ($result['summary'] ?? (
                $locale === 'ar' ? 'دي التقارير المتاحة.' : 'Here are the available reports.'
            )),
            'explain_feature' => $this->composeExplainFeatureReply($result, $locale),
            'navigate_report' => $this->composeNavigateReply($result, $locale),
            'export_report' => (string) ($result['message'] ?? (
                $locale === 'ar' ? 'التصدير جاهز.' : 'Export is ready.'
            )),
            'list_delayed_leads' => $locale === 'ar'
                ? 'لقيت '.((int) ($result['count'] ?? 0)).' ليد متأخر. اضغط على كارت ليد عشان نبدأ.'
                : 'Found '.((int) ($result['count'] ?? 0)).' delayed leads. Click a lead card to start working on it.',
            'create_lead_draft' => (string) ($result['message'] ?? (
                $locale === 'ar' ? 'مسودة الليد جاهزة.' : 'Lead draft ready.'
            )),
            'create_lead_action_draft' => (string) ($result['message'] ?? (
                $locale === 'ar' ? 'مسودة الأكشن جاهزة.' : 'Lead action draft ready.'
            )),
            'create_task_for_lead' => (string) ($result['message'] ?? (
                $locale === 'ar' ? 'مسودة التاسك جاهزة.' : 'Task draft ready.'
            )),
            default => $locale === 'ar' ? 'تم.' : 'Done.',
        };
    }

    protected function composeExplainFeatureReply(array $result, string $locale = 'en'): string
    {
        $topic = trim((string) ($result['topic'] ?? 'Feature'));
        $explanation = trim((string) ($result['explanation'] ?? ''));
        $modules = collect($result['modules'] ?? [])
            ->filter(fn ($module) => is_array($module) && trim((string) ($module['name'] ?? '')) !== '')
            ->values()
            ->all();
        $reports = collect($result['available_reports'] ?? [])
            ->filter(fn ($name) => is_string($name) && trim($name) !== '')
            ->values()
            ->all();
        $copilot = collect($result['copilot'] ?? [])
            ->filter(fn ($item) => is_string($item) && trim($item) !== '')
            ->values()
            ->all();

        if ($modules !== []) {
            $lines = [
                $explanation !== ''
                    ? $explanation
                    : ($locale === 'ar'
                        ? 'ده اللي تقدر توصل له في Besouhola CRM.'
                        : 'Here is what you can access in Besouhola CRM.'),
                '',
            ];

            foreach ($modules as $module) {
                $name = trim((string) ($module['name'] ?? ''));
                $description = trim((string) ($module['description'] ?? ''));
                $lines[] = $description !== ''
                    ? "• {$name} — {$description}"
                    : "• {$name}";
            }

            $reportCount = count($reports);
            $lines[] = '';
            if ($locale === 'ar') {
                $lines[] = $reportCount > 0
                    ? "التقارير: {$reportCount} متاحة. اطلب فتح أو تصدير أي تقرير بالاسم."
                    : 'التقارير: مفيش تقارير متاحة حسب صلاحياتك.';
                $lines[] = '';
                $lines[] = 'اضغط على موديول تحت عشان تفتحه.';
            } else {
                $lines[] = $reportCount > 0
                    ? "Reports: {$reportCount} available. Ask me to open or export any report by name."
                    : 'Reports: none available for your permissions.';
                $lines[] = '';
                $lines[] = 'Tap a module below to open it.';
            }

            return implode("\n", $lines);
        }

        $lines = [];
        if ($explanation !== '') {
            $lines[] = $topic;
            $lines[] = $explanation;
        } else {
            $lines[] = $topic;
        }

        if ($copilot !== []) {
            $lines[] = '';
            $lines[] = $locale === 'ar' ? 'من الكوبايلوت:' : 'From Copilot:';
            foreach ($copilot as $item) {
                $lines[] = '• '.$item;
            }
        }

        if ($reports !== []) {
            $lines[] = '';
            $lines[] = $locale === 'ar'
                ? 'التقارير: '.count($reports).' متاحة — اطلب فتح تقرير بالاسم.'
                : 'Reports: '.count($reports).' available — ask me to open one by name.';
        }

        if (($result['can_show'] ?? null) === false) {
            $lines[] = '';
            $lines[] = $locale === 'ar'
                ? 'حالياً معندكش صلاحية تفتح ده.'
                : 'You currently do not have access to open this.';
        }

        return trim(implode("\n", $lines));
    }

    protected function composeNavigateReply(array $result, string $locale = 'en'): string
    {
        $report = (string) ($result['report'] ?? ($locale === 'ar' ? 'التقرير' : 'the report'));
        $filters = is_array($result['filters'] ?? null) ? $result['filters'] : [];
        $from = $filters['created_from'] ?? $filters['date_from'] ?? null;
        $to = $filters['created_to'] ?? $filters['date_to'] ?? null;

        if ($locale === 'ar') {
            if ($from && $to) {
                return "بفتح {$report} من {$from} إلى {$to}.";
            }
            if ($from) {
                return "بفتح {$report} من {$from}.";
            }

            return "بفتح {$report}.";
        }

        if ($from && $to) {
            return "Opening {$report} filtered from {$from} to {$to}.";
        }

        if ($from) {
            return "Opening {$report} filtered from {$from}.";
        }

        return "Opening {$report}.";
    }

    protected function defaultReply(User $user, string $message, string $locale = 'en'): string
    {
        $catalog = $this->catalog->forUser($user);
        $moduleNames = collect($catalog['modules'] ?? [])
            ->map(fn ($module) => $this->catalog->localizeModule($module, $locale)['name'] ?? null)
            ->filter()
            ->take(6)
            ->implode($locale === 'ar' ? ' · ' : ', ');
        $reportNames = collect($catalog['reports'])->pluck('name')->take(5)->implode($locale === 'ar' ? ' · ' : ', ');

        if ($locale === 'ar') {
            return "أنا Besouhola Copilot. أقدر أشرح الموديولات ({$moduleNames})، أفتح التقارير ({$reportNames})، أعرض الليدز المتأخرة، وأنشئ ليد أو أكشن أو تاسك. اطلب مني اشرح السيستم أو افتح تقرير أو اعرض الليدز المتأخرة.";
        }

        return "I'm Besouhola Copilot. I can explain modules ({$moduleNames}), open reports ({$reportNames}), list delayed leads, and draft leads, actions, or tasks. Ask me to explain the system, open a report, or show delayed leads.";
    }

    protected function guessLeadArgs(string $message): array
    {
        $args = [];
        $message = $this->normalizeLeadMessageNewlines($message);
        $normalized = preg_replace('/\s+/u', ' ', trim($message)) ?? trim($message);

        if (preg_match('/(?:^|\s)name\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:phone|mobile|email|source|item|project|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['name'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)email\s*[:\-]?\s*([^\s]+@[^\s]+)/iu', $normalized, $match)) {
            $args['email'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)(?:phone|mobile)\s*[:\-]?\s*([0-9\+\-\s]{6,})(?=\s+(?:email|source|item|project|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['phone'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)source\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:item|project|phone|mobile|email|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['source'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)secondary[_ ]phone\s*[:\-]?\s*([0-9\+\-\s]{6,})(?=\s+(?:email|source|item|project|name|phone|mobile|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['secondary_phone'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)estimated[_ ]value\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/iu', $normalized, $match)) {
            $args['estimated_value'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)assigned[_ ]to\s*[:\-]?\s*(\d+)/iu', $normalized, $match)) {
            $args['assigned_to'] = (int) $match[1];
        } elseif (preg_match('/(?:^|\s)assigned[_ ]to\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:phone|mobile|email|source|item|project|name|secondary[_ ]phone|estimated[_ ]value)\b|$)/iu', $normalized, $match)) {
            $candidate = trim($match[1]);
            if ($candidate !== '') {
                $args['assigned_to_name'] = $candidate;
            }
        }

        if (preg_match('/(?:^|\s)item\s*(?:id)?\s*[:\-]?\s*(\d+)(?=\s+(?:project|phone|mobile|email|source|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['item_id'] = (int) $match[1];
        } elseif (preg_match('/(?:^|\s)item\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:project|phone|mobile|email|source|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['item'] = trim($match[1]);
        }

        if (preg_match('/(?:^|\s)project\s*(?:id)?\s*[:\-]?\s*(\d+)(?=\s+(?:item|phone|mobile|email|source|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['project_id'] = (int) $match[1];
        } elseif (preg_match('/(?:^|\s)project\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:item|phone|mobile|email|source|name|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\b|$)/iu', $normalized, $match)) {
            $args['project'] = trim($match[1]);
        }

        if (! isset($args['name']) && preg_match('/(?:\x{0627}\x{0633}\x{0645}|\x{0628}\x{0627}\x{0633}\x{0645})\s*[:\-]?\s*([^\d@:\-\n\r]{2,}?)(?=\s+(?:\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{062A}\x{0644}\x{064A}\x{0641}\x{0648}\x{0646}|\x{0647}\x{0627}\x{062A}\x{0641}|\x{0648}\x{0631}\x{0642}\x{0645}|\x{0631}\x{0642}\x{0645}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0627}\x{0644}\x{0628}\x{0631}\x{064A}\x{062F}|\x{0633}\x{0648}\x{0631}\x{0633}|\x{0645}\x{0635}\x{062F}\x{0631}|\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639})\b|$)/u', $normalized, $match)) {
            $candidate = trim($match[1]);
            if ($candidate !== '') {
                $args['name'] = $candidate;
            }
        }

        if (! isset($args['email']) && preg_match('/(?:\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0627}\x{0644}\x{0628}\x{0631}\x{064A}\x{062F})\s*[:\-]?\s*([^\s]+@[^\s]+)/u', $normalized, $match)) {
            $args['email'] = trim($match[1]);
        }

        if (! isset($args['phone']) && preg_match('/(?:\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{062A}\x{0644}\x{064A}\x{0641}\x{0648}\x{0646}|\x{0647}\x{0627}\x{062A}\x{0641}|\x{0648}\x{0631}\x{0642}\x{0645}|\x{0631}\x{0642}\x{0645})\s*[:\-]?\s*([0-9\+\-\s]{6,})(?=\s+(?:\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0627}\x{0644}\x{0628}\x{0631}\x{064A}\x{062F}|\x{0633}\x{0648}\x{0631}\x{0633}|\x{0645}\x{0635}\x{062F}\x{0631}|\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639})\b|$)/u', $normalized, $match)) {
            $args['phone'] = trim($match[1]);
        }

        if (! isset($args['source']) && preg_match('/(?:\x{0633}\x{0648}\x{0631}\x{0633}|\x{0645}\x{0635}\x{062F}\x{0631})\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639}|\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644})\b|$)/u', $normalized, $match)) {
            $args['source'] = trim($match[1]);
        }

        if (! isset($args['item_id']) && ! isset($args['item']) && preg_match('/(?:\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645})\s*(?:id)?\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639}|\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0645}\x{0635}\x{062F}\x{0631})\b|$)/u', $normalized, $match)) {
            $candidate = trim($match[1]);
            if (preg_match('/^\d+$/', $candidate)) {
                $args['item_id'] = (int) $candidate;
            } elseif ($candidate !== '') {
                $args['item'] = $candidate;
            }
        }

        if (! isset($args['project_id']) && ! isset($args['project']) && preg_match('/(?:\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639})\s*(?:id)?\s*[:\-]?\s*([^\n\r]+?)(?=\s+(?:\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0645}\x{0635}\x{062F}\x{0631})\b|$)/u', $normalized, $match)) {
            $candidate = trim($match[1]);
            if (preg_match('/^\d+$/', $candidate)) {
                $args['project_id'] = (int) $candidate;
            } elseif ($candidate !== '') {
                $args['project'] = $candidate;
            }
        }

        if (! isset($args['name']) && preg_match('/^(?:\x{0639}\x{0627}\x{064A}\x{0632}|\x{0645}\x{062D}\x{062A}\x{0627}\x{062C})?\s*(?:\x{0627}\x{0639}\x{0645}\x{0644}|\x{0627}\x{0646}\x{0634}\x{0626}|create)?\s*(?:lead|\x{0644}\x{064A}\x{062F})(?:\s+(?:new|\x{062C}\x{062F}\x{064A}\x{062F}))?\s*(?:\x{0628}\x{0627}\x{0633}\x{0645})?\s*(.+)$/iu', $normalized, $match)) {
            $candidate = trim($match[1], " \t\n\r\0\x0B:-");
            $candidate = preg_replace('/^(?:name|phone|mobile|email|source|item|project|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to|\x{0627}\x{0633}\x{0645}|\x{0628}\x{0627}\x{0633}\x{0645}|\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{062A}\x{0644}\x{064A}\x{0641}\x{0648}\x{0646}|\x{0647}\x{0627}\x{062A}\x{0641}|\x{0648}\x{0631}\x{0642}\x{0645}|\x{0631}\x{0642}\x{0645}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0627}\x{0644}\x{0628}\x{0631}\x{064A}\x{062F}|\x{0633}\x{0648}\x{0631}\x{0633}|\x{0645}\x{0635}\x{062F}\x{0631}|\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639})\s*[:\-]\s*/iu', '', $candidate) ?? $candidate;
            $candidate = preg_split('/\s+(?:mobile|phone|email|source|item|project|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to|\x{0645}\x{0648}\x{0628}\x{0627}\x{064A}\x{0644}|\x{062A}\x{0644}\x{064A}\x{0641}\x{0648}\x{0646}|\x{0647}\x{0627}\x{062A}\x{0641}|\x{0648}\x{0631}\x{0642}\x{0645}|\x{0631}\x{0642}\x{0645}|\x{0627}\x{064A}\x{0645}\x{064A}\x{0644}|\x{0627}\x{0644}\x{0628}\x{0631}\x{064A}\x{062F}|\x{0633}\x{0648}\x{0631}\x{0633}|\x{0645}\x{0635}\x{062F}\x{0631}|\x{0627}\x{064A}\x{062A}\x{0645}|\x{0622}\x{064A}\x{062A}\x{0645}|\x{0628}\x{0631}\x{0648}\x{062C}\x{064A}\x{0643}\x{062A}|\x{0645}\x{0634}\x{0631}\x{0648}\x{0639})\b/iu', $candidate, 2)[0] ?? $candidate;
            $candidate = trim($candidate, " \t\n\r\0\x0B:-");
            if ($candidate !== '') {
                $args['name'] = $candidate;
            }
        }

        return $args;
    }
    protected function resolvePendingLeadDraft(?AiCopilotConversation $conversation): ?array
    {
        $payload = $this->resolveLatestLeadDraftPayload($conversation);
        if (! $payload || ($payload['state'] ?? null) !== 'needs_input') {
            return null;
        }

        return $payload;
    }

    protected function resolvePendingOptionalLeadDraft(?AiCopilotConversation $conversation): ?array
    {
        $payload = $this->resolveLatestLeadDraftPayload($conversation);
        if (! $payload || ($payload['state'] ?? null) !== 'awaiting_optional_input') {
            return null;
        }

        return $payload;
    }

    protected function shouldStartOptionalLeadDraft(?AiCopilotConversation $conversation, string $message): ?array
    {
        if (trim($message) !== '__copilot_optional_start__') {
            return null;
        }

        $payload = $this->resolveLatestLeadDraftPayload($conversation);
        if (! $payload || ($payload['state'] ?? null) !== 'awaiting_confirmation') {
            return null;
        }

        return is_array($payload['payload'] ?? null) ? $payload['payload'] : null;
    }

    protected function resolveLatestLeadDraftPayload(?AiCopilotConversation $conversation): ?array
    {
        if (! $conversation || ! Schema::hasTable('ai_copilot_messages')) {
            return null;
        }

        $message = AiCopilotMessage::query()
            ->where('conversation_id', $conversation->id)
            ->where('tool_name', 'create_lead_draft')
            ->latest('id')
            ->first();

        return is_array($message?->tool_payload) ? $message->tool_payload : null;
    }

    protected function buildOptionalLeadStartArgs(array $payload): array
    {
        return array_merge($payload, ['copilot_optional_flow' => 'start']);
    }

    protected function mergePendingOptionalLeadDraftArgs(array $pendingDraft, string $message): array
    {
        $payload = is_array($pendingDraft['payload'] ?? null) ? $pendingDraft['payload'] : [];
        $step = (string) ($pendingDraft['optional_step'] ?? '');

        if (trim($message) === '__copilot_skip_optional__') {
            return array_merge($payload, [
                'copilot_optional_flow' => 'continue',
                'copilot_optional_step' => $step,
                'copilot_optional_skip' => true,
            ]);
        }

        $guessed = $this->guessLeadArgs($message);
        if (($payload['name'] ?? null) && ! preg_match('/(?:^|\s)(?:name|\x{0627}\x{0633}\x{0645}|\x{0628}\x{0627}\x{0633}\x{0645})\s*[:\-]/iu', $message)) {
            unset($guessed['name']);
        }
        if ($this->hasNoDirectLeadFieldGuess(array_merge($payload, $guessed), $payload)) {
            $guessed = $this->assignPendingLeadField($guessed, $step, trim($message));
        }

        return array_merge($payload, $guessed, [
            'copilot_optional_flow' => 'continue',
            'copilot_optional_step' => $step,
        ]);
    }

    protected function normalizeLeadMessageNewlines(string $message): string
    {
        // Older clients accidentally joined form fields with the literal characters "\n".
        return str_replace(["\\r\\n", "\\n", "\\r"], ["\n", "\n", "\n"], $message);
    }

    protected function mergePendingLeadDraftArgs(array $pendingDraft, string $message): array
    {
        $payload = is_array($pendingDraft['payload'] ?? null) ? $pendingDraft['payload'] : [];
        $message = $this->normalizeLeadMessageNewlines($message);
        $merged = array_merge($payload, $this->guessLeadArgs($message));
        $missingFields = array_values(array_filter($pendingDraft['missing_fields'] ?? [], fn ($field) => is_string($field)));
        $rawLines = preg_split('/\r\n|\r|\n/u', trim($message)) ?: [];
        $rawLines = array_values(array_filter(array_map('trim', $rawLines), fn ($line) => $line !== ''));

        if ($missingFields !== [] && $this->hasNoDirectLeadFieldGuess($merged, $payload)) {
            if (count($missingFields) === 1) {
                $merged = $this->assignPendingLeadField($merged, $missingFields[0], trim($message));
            } elseif (count($rawLines) === count($missingFields)) {
                foreach ($missingFields as $index => $field) {
                    $merged = $this->assignPendingLeadField($merged, $field, $rawLines[$index] ?? '');
                }
            }
        }

        return $merged;
    }

    protected function hasNoDirectLeadFieldGuess(array $merged, array $originalPayload): bool
    {
        foreach (['name', 'phone', 'email', 'source', 'item', 'item_id', 'project', 'project_id', 'secondary_phone', 'estimated_value', 'assigned_to', 'assigned_to_name'] as $field) {
            if (($merged[$field] ?? null) !== ($originalPayload[$field] ?? null) && filled($merged[$field] ?? null)) {
                return false;
            }
        }

        return true;
    }

    protected function assignPendingLeadField(array $payload, string $field, string $value): array
    {
        $value = trim($value);
        if ($value === '') {
            return $payload;
        }

        // Form submissions arrive as "assigned_to: 12" (or similar). Strip the label prefix.
        if (preg_match('/^(?:name|phone|mobile|email|source|item|project|secondary[_ ]phone|estimated[_ ]value|assigned[_ ]to)\s*[:\-]\s*(.+)$/iu', $value, $match)) {
            $value = trim($match[1]);
        }

        return match ($field) {
            'item' => preg_match('/^\d+$/', $value)
                ? array_merge($payload, ['item_id' => (int) $value])
                : array_merge($payload, ['item' => $value]),
            'project' => preg_match('/^\d+$/', $value)
                ? array_merge($payload, ['project_id' => (int) $value])
                : array_merge($payload, ['project' => $value]),
            'assigned_to' => preg_match('/^\d+$/', $value)
                ? array_merge($payload, ['assigned_to' => (int) $value])
                : array_merge($payload, ['assigned_to_name' => $value]),
            'estimated_value' => array_merge($payload, ['estimated_value' => $value]),
            'secondary_phone' => array_merge($payload, ['secondary_phone' => $value]),
            default => array_merge($payload, [$field => $value]),
        };
    }

    protected function looksLikeLeadCreationRequest(string $text): bool
    {
        return (bool) preg_match('/(create lead|new lead|lead name|lead named|create a lead|\x{0627}\x{0646}\x{0634}\x{0626}\s+\x{0644}\x{064A}\x{062F}|\x{0627}\x{0639}\x{0645}\x{0644}\s+\x{0644}\x{064A}\x{062F}|\x{0644}\x{064A}\x{062F}\s+\x{062C}\x{062F}\x{064A}\x{062F}|\x{0644}\x{064A}\x{062F}\s+\x{0628}\x{0627}\x{0633}\x{0645}|\x{0639}\x{0627}\x{064A}\x{0632}\s+\x{0627}\x{0646}\x{0634}\x{0626}\s+\x{0644}\x{064A}\x{062F}|\x{0639}\x{0627}\x{064A}\x{0632}\s+\x{0627}\x{0639}\x{0645}\x{0644}\s+\x{0644}\x{064A}\x{062F})/iu', $text);
    }

    protected function sanitizeLeadActionPlan(array $planned, string $message, ?User $user = null, string $locale = 'en', ?AiCopilotConversation $conversation = null): array
    {
        if (($planned['tool'] ?? null) !== 'create_lead_action_draft') {
            return $planned;
        }

        // Wizard owns stage/type/outcome; only seed lead_id.
        $fromMessage = $this->buildLeadActionWizardStartArgs($message, $user, $locale, $conversation);
        $geminiLeadId = (int) (($planned['args']['lead_id'] ?? 0));
        if (empty($fromMessage['lead_id']) && $geminiLeadId > 0) {
            $fromMessage['lead_id'] = $geminiLeadId;
        }

        $planned['args'] = $fromMessage;

        return $planned;
    }

    protected function resolvePendingLeadActionDraft(?AiCopilotConversation $conversation): ?array
    {
        $payload = $this->resolveLatestLeadActionDraftPayload($conversation);
        if (! $payload) {
            return null;
        }

        $state = (string) ($payload['state'] ?? '');
        if (! in_array($state, ['needs_input', 'awaiting_action_type', 'awaiting_details', 'awaiting_stage', 'awaiting_schedule'], true)) {
            return null;
        }

        return $payload;
    }

    protected function resolveLatestLeadActionDraftPayload(?AiCopilotConversation $conversation): ?array
    {
        if (! $conversation || ! Schema::hasTable('ai_copilot_messages')) {
            return null;
        }

        $message = AiCopilotMessage::query()
            ->where('conversation_id', $conversation->id)
            ->where('tool_name', 'create_lead_action_draft')
            ->latest('id')
            ->first();

        return is_array($message?->tool_payload) ? $message->tool_payload : null;
    }

    protected function buildLeadActionWizardStartArgs(string $message, ?User $user = null, string $locale = 'en', ?AiCopilotConversation $conversation = null): array
    {
        $args = [];

        $leadId = $this->extractLeadIdFromMessage($message);
        if ($leadId) {
            $args['lead_id'] = $leadId;
        } elseif ($user) {
            $resolvedId = $this->resolveLeadIdByName($user, $message);
            if (! $resolvedId && $conversation) {
                $resolvedId = $this->resolveLeadIdFromRecentContext($user, $conversation);
            }
            if ($resolvedId) {
                $args['lead_id'] = $resolvedId;
            }
        }

        $details = $this->extractActionDetailsFromMessage($message);
        if ($details !== null && $details !== '') {
            $args['details_text'] = $details;
        }

        $rawDetails = trim($message);
        if ($rawDetails !== '') {
            $args['raw_details'] = $rawDetails;
        }

        return $args;
    }

    protected function buildLeadActionRestartArgs(?AiCopilotConversation $conversation, string $message): ?array
    {
        if (trim($message) !== '__copilot_action_restart_stage__') {
            return null;
        }

        $payload = $this->resolveLatestLeadActionDraftPayload($conversation);
        if (! $payload) {
            return null;
        }

        $state = (string) ($payload['state'] ?? '');
        if (! in_array($state, ['awaiting_confirmation', 'awaiting_stage'], true)) {
            return null;
        }

        $draft = is_array($payload['payload'] ?? null) ? $payload['payload'] : [];
        $leadId = (int) ($draft['lead_id'] ?? 0);
        $detailsText = trim((string) ($draft['details_text'] ?? $draft['description'] ?? ''));
        if ($leadId <= 0 || $detailsText === '') {
            return null;
        }

        return [
            'lead_id' => $leadId,
            'details_text' => $detailsText,
        ];
    }

    protected function mergePendingLeadActionDraftArgs(
        array $pendingDraft,
        string $message,
        ?User $user = null,
        string $locale = 'en',
        ?AiCopilotConversation $conversation = null
    ): array {
        $payload = is_array($pendingDraft['payload'] ?? null) ? $pendingDraft['payload'] : [];
        $state = (string) ($pendingDraft['state'] ?? '');
        $leadId = (int) ($payload['lead_id'] ?? 0);
        $detailsText = trim((string) ($payload['details_text'] ?? ''));
        $trimmed = trim($message);

        $args = [
            'lead_id' => $leadId > 0 ? $leadId : null,
            'details_text' => $detailsText !== '' ? $detailsText : null,
            'type' => ! empty($payload['type']) ? $payload['type'] : null,
        ];

        if (preg_match('/^__copilot_action_stage__:(\d+)$/', $trimmed, $match)) {
            $args['stage_id'] = (int) $match[1];

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if (preg_match('/^__copilot_action_type__:(.+)$/', $trimmed, $match)) {
            $args['type'] = trim((string) $match[1]);

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if ($state === 'needs_input' || $leadId <= 0) {
            $resolvedId = $this->extractLeadIdFromMessage($trimmed);
            if (! $resolvedId && $user) {
                $resolvedId = $this->resolveLeadIdByName($user, $trimmed);
            }
            // Last resort: treat the whole reply as an exact lead name (e.g. "t").
            if (! $resolvedId && $user && preg_match('/^[A-Za-z\p{Arabic}\w.\-]{1,60}$/u', $trimmed)) {
                $resolvedId = $this->findLeadByNameCandidate($user, $trimmed)?->id;
            }
            if (! $resolvedId && $user && $conversation) {
                $resolvedId = $this->resolveLeadIdFromRecentContext($user, $conversation);
            }
            if ($resolvedId) {
                $args['lead_id'] = (int) $resolvedId;
            }

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if ($state === 'awaiting_action_type') {
            $normalizedType = $trimmed;
            if (preg_match('/^__copilot_action_type__:(.+)$/', $trimmed, $match)) {
                $normalizedType = trim((string) $match[1]);
            }
            $args['type'] = $normalizedType;

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if ($state === 'awaiting_details') {
            // If the user picks a stage button while we still need details, ignore it and keep asking.
            if (preg_match('/^__copilot_action_stage__:\d+$/', $trimmed)) {
                return array_filter($args, fn ($value) => $value !== null && $value !== '');
            }
            $args['details_text'] = $trimmed;

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if ($state === 'awaiting_schedule') {
            $args['stage_id'] = (int) ($payload['stage_id'] ?? 0) ?: null;
            $args['schedule_text'] = $trimmed;
            if (! empty($payload['type'])) {
                $args['type'] = $payload['type'];
            }
            if (! empty($payload['next_action_type'])) {
                $args['next_action_type'] = $payload['next_action_type'];
            }

            return array_filter($args, fn ($value) => $value !== null && $value !== '');
        }

        if ($state === 'awaiting_stage') {
            if (preg_match('/^\d+$/', $trimmed)) {
                $args['stage_id'] = (int) $trimmed;
            } else {
                $args['stage_name'] = $trimmed;
            }
        }

        return array_filter($args, fn ($value) => $value !== null && $value !== '');
    }

    protected function guessLeadActionArgs(string $message, ?User $user = null): array
    {
        // Kept for backwards compatibility; wizard start should use buildLeadActionWizardStartArgs.
        return $this->buildLeadActionWizardStartArgs($message, $user);
    }

    protected function resolveLeadIdByName(User $user, string $message): ?int
    {
        $name = $this->extractLeadNameCandidate($message);
        if ($name === null || $name === '' || ! Schema::hasTable('leads')) {
            return null;
        }

        $candidates = $this->leadNameLookupCandidates($name);
        foreach ($candidates as $candidate) {
            $lead = $this->findLeadByNameCandidate($user, $candidate);
            if ($lead) {
                return (int) $lead->id;
            }
        }

        return null;
    }

    protected function findLeadByNameCandidate(User $user, string $candidate): ?Lead
    {
        $base = Lead::query()->where('tenant_id', $user->tenant_id);
        $needle = mb_strtolower(trim($candidate));
        if ($needle === '') {
            return null;
        }

        // Short names like "t" / "r" must match exactly to avoid noisy LIKE hits.
        if (mb_strlen($needle) <= 2) {
            return (clone $base)
                ->whereRaw('LOWER(TRIM(name)) = ?', [$needle])
                ->orderByDesc('id')
                ->first(['id', 'name']);
        }

        $exact = (clone $base)
            ->whereRaw('LOWER(TRIM(name)) = ?', [$needle])
            ->orderByDesc('id')
            ->first(['id', 'name']);
        if ($exact) {
            return $exact;
        }

        return (clone $base)
            ->where('name', 'like', '%'.$candidate.'%')
            ->orderByDesc('id')
            ->first(['id', 'name']);
    }

    /**
     * @return array<int, string>
     */
    protected function leadNameLookupCandidates(string $name): array
    {
        $normalized = trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
        if ($normalized === '') {
            return [];
        }

        $parts = preg_split('/\s+/u', $normalized) ?: [];
        $candidates = [$normalized];
        if (count($parts) >= 2) {
            $candidates[] = trim($parts[0].' '.$parts[1]);
        }
        if ($parts !== []) {
            $candidates[] = $parts[0];
        }

        return array_values(array_unique(array_filter($candidates, fn ($item) => mb_strlen(trim($item)) >= 1)));
    }

    protected function extractLeadNameCandidate(string $message): ?string
    {
        $trimmed = trim($message);
        $name = null;

        // "on lead hazem ..." / "for lead gehad mo ..." / "lead hazem i ..."
        if (preg_match(
            '/(?:\b(?:on|for)\s+lead\b|\blead\b|على\s*(?:ال)?ليد|لـ|للليد)\s+([A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]*(?:\s+[A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]*){0,2})/iu',
            $trimmed,
            $match
        )) {
            $name = trim((string) $match[1]);
        } elseif (preg_match('/^([A-Za-z\p{Arabic}\w.\-]{1,40})\s+اسم\s*(?:ال)?ليد\b/u', $trimmed, $match)) {
            // "t اسم الليد"
            $name = trim((string) $match[1]);
        } elseif (preg_match('/اسم\s*(?:ال)?ليد\s*[:\-]?\s*([A-Za-z\p{Arabic}\w.\- ]{1,80})$/u', $trimmed, $match)) {
            // "اسم الليد t" / "اسم الليد hazem"
            $name = trim((string) $match[1]);
        } elseif (preg_match(
            '/^(?!.*(action|task|أكشن|اكشن|تاسك|مهمة|report|تقرير|اسم))([A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]{0,40}(?:\s+[A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]{0,40}){0,3})$/iu',
            $trimmed,
            $match
        )) {
            // Bare person name reply while wizard is waiting for a lead (allows 1-char names like "t").
            $name = trim((string) $match[2]);
        }

        return $this->cleanLeadNameCandidate((string) $name);
    }

    protected function cleanLeadNameCandidate(string $name): ?string
    {
        $name = trim($name, " \t\n\r\0\x0B\"'.,");
        $name = preg_replace('/\s+/u', ' ', $name) ?? $name;
        $name = preg_replace('/^(?:اعمل|أنشئ|انشئ|ابدأ|create|add|start)\s+/iu', '', $name) ?? $name;
        $name = trim($name);

        // Stop narrative words from sticking to the name ("hazem i meet...").
        $stop = '(?:i|he|she|they|we|and|who|that|because|after|before|with|for|to|from|about|met|meet|meeting|call|called|tomorrow|tommorow|today|yesterday|اسم|و|انا|أنا|هو|هي|اتصلت|كلمته|مع|بكرة|بكرا|غدا|غداً|اليوم|اجتماع|مكالمة)';
        if (preg_match('/^(.+?)(?:\s+'.$stop.'\b.*)?$/iu', $name, $match)) {
            $name = trim((string) $match[1]);
        }

        if ($name === '' || mb_strlen($name) < 1 || preg_match('/^\d+$/', $name)) {
            return null;
        }

        return $name;
    }

    protected function extractActionDetailsFromMessage(string $message): ?string
    {
        $trimmed = trim($message);
        if ($trimmed === '') {
            return null;
        }

        $leadName = $this->extractLeadNameCandidate($trimmed);
        if ($leadName) {
            // Prefer splitting on the cleaned lead name so "i meet..." is not swallowed.
            $quoted = preg_quote($leadName, '/');
            if (preg_match(
                '/(?:\b(?:on|for)\s+lead\b|\blead\b|على\s*(?:ال)?ليد|لـ|للليد)\s+'.$quoted.'\s+(.+)$/iu',
                $trimmed,
                $match
            )) {
                $details = trim((string) $match[1], " \t\n\r\0\x0B\"'.,");
                if (mb_strlen($details) >= 8) {
                    return $details;
                }
            }
        }

        // Fallback: story after lead token, stopping name at first narrative word.
        if (preg_match(
            '/(?:\b(?:on|for)\s+lead\b|\blead\b|على\s*(?:ال)?ليد|لـ|للليد)\s+[A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]*(?:\s+[A-Za-z\p{Arabic}][\w\p{Arabic}\.\-]*){0,2}\s+(.+)$/iu',
            $trimmed,
            $match
        )) {
            $details = trim((string) $match[1], " \t\n\r\0\x0B\"'.,");
            // If the greedy name ate "i meet...", recover common openings.
            if (! preg_match('/^(?:i|he|she|we|they|met|meet|call|called|اتصلت|كلمته|اجتمع)/iu', $details)) {
                if (preg_match('/\b((?:i\s+)?(?:met|meet(?:ing)?)\s+with\b.+)$/iu', $trimmed, $recover)) {
                    $details = trim((string) $recover[1]);
                }
            }

            return mb_strlen($details) >= 8 ? $details : null;
        }

        if ($this->looksLikeCreateLeadActionRequest($trimmed) && mb_strlen($trimmed) < 40) {
            return null;
        }

        return null;
    }

    protected function resolveLeadIdFromRecentContext(User $user, ?AiCopilotConversation $conversation): ?int
    {
        if (! $conversation || ! Schema::hasTable('ai_copilot_messages')) {
            return null;
        }

        $recent = AiCopilotMessage::query()
            ->where('conversation_id', $conversation->id)
            ->where('role', 'user')
            ->latest('id')
            ->limit(6)
            ->get(['content']);

        foreach ($recent as $row) {
            $content = trim((string) ($row->content ?? ''));
            if ($content === '') {
                continue;
            }
            $leadId = $this->extractLeadIdFromMessage($content);
            if ($leadId) {
                return $leadId;
            }
            $byName = $this->resolveLeadIdByName($user, $content);
            if ($byName) {
                return $byName;
            }
        }

        return null;
    }

    protected function handleLeadFocusIntent(User $user, ?AiCopilotConversation $conversation, string $message, string $locale = 'en'): ?array
    {
        // Creating a follow-up/action/task must go through tools, not advice focus.
        if ($this->looksLikeCreateLeadActionRequest($message) || $this->looksLikeCreateTaskRequest($message)) {
            return null;
        }

        $leadId = $this->extractLeadIdFromMessage($message);
        $pendingDelayed = $this->resolveLatestDelayedLeads($conversation);
        $pendingLeads = is_array($pendingDelayed['leads'] ?? null) ? $pendingDelayed['leads'] : [];
        $wantsFocus = $this->looksLikeLeadFocusRequest($message);

        if ($leadId && $wantsFocus) {
            return $this->buildLeadFocusReply($user, $leadId, $locale);
        }

        if ($pendingLeads !== [] && $this->looksLikeDelayedLeadSelection($message)) {
            if ($leadId) {
                return $this->buildLeadFocusReply($user, $leadId, $locale);
            }

            if (count($pendingLeads) === 1) {
                return $this->buildLeadFocusReply($user, (int) ($pendingLeads[0]['id'] ?? 0), $locale);
            }

            return $this->buildDelayedLeadChoicePrompt($pendingLeads, $locale);
        }

        // Keep legacy "lead {id} + advice keywords" behavior even without delayed context.
        if ($leadId && $this->looksLikeLeadAdviceRequest($message)) {
            return $this->buildLeadFocusReply($user, $leadId, $locale);
        }

        return null;
    }

    protected function extractLeadIdFromMessage(string $message): ?int
    {
        if (preg_match('/(?:\blead\s*#?\s*|#\s*)(\d+)\b/iu', $message, $match)) {
            $leadId = (int) $match[1];

            return $leadId > 0 ? $leadId : null;
        }

        if (preg_match('/(?:\x{0644}\x{0644}\x{064A}\x{062F}|\x{0627}\x{0644}\x{0644}\x{064A}\x{062F}|\x{0644}\x{064A}\x{062F})\s*(?:\x{0631}\x{0642}\x{0645}|#)?\s*(\d+)/u', $message, $match)) {
            $leadId = (int) $match[1];

            return $leadId > 0 ? $leadId : null;
        }

        return null;
    }

    protected function looksLikeLeadFocusRequest(string $message): bool
    {
        return $this->looksLikeLeadAdviceRequest($message)
            || $this->looksLikeDelayedLeadSelection($message);
    }

    protected function looksLikeCreateLeadActionRequest(string $message): bool
    {
        $normalized = mb_strtolower($message);

        return (bool) preg_match(
            '/(?:\x{0627}\x{0639}\x{0645}\x{0644}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0639}\x{0645}\x{0644}\s*\x{0627}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0646}\x{0634}\x{0626}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0623}\x{0646}\x{0634}\x{0626}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0625}\x{0646}\x{0634}\x{0627}\x{0621}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0628}\x{062F}\x{0623}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0628}\x{062F}\x{0623}\s*\x{0627}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0628}\x{062F}\x{0627}\s*\x{0623}\x{0643}\x{0634}\x{0646}|\x{0627}\x{0628}\x{062F}\x{0627}\s*\x{0627}\x{0643}\x{0634}\x{0646}|\x{0623}\x{0643}\x{0634}\x{0646}\s*\x{0645}\x{062A}\x{0627}\x{0628}\x{0639}\x{0629}|\x{0627}\x{0643}\x{0634}\x{0646}\s*\x{0645}\x{062A}\x{0627}\x{0628}\x{0639}\x{0629}|add\s+(an\s+)?action|create\s+(a\s+)?(follow[ -_]?up\s+)?action|start\s+(an\s+)?action|follow[ -_]?up\s+action|log\s+(an\s+)?action)/iu',
            $normalized
        );
    }

    protected function looksLikeCreateTaskRequest(string $message): bool
    {
        $normalized = mb_strtolower($message);

        return (bool) preg_match(
            '/(?:\x{0627}\x{0639}\x{0645}\x{0644}\s*\x{062A}\x{0627}\x{0633}\x{0643}|\x{0627}\x{0646}\x{0634}\x{0626}\s*\x{062A}\x{0627}\x{0633}\x{0643}|\x{0623}\x{0646}\x{0634}\x{0626}\s*\x{062A}\x{0627}\x{0633}\x{0643}|\x{0625}\x{0646}\x{0634}\x{0627}\x{0621}\s*\x{062A}\x{0627}\x{0633}\x{0643}|create\s+(a\s+)?task)/iu',
            $normalized
        );
    }

    protected function looksLikeLeadAdviceRequest(string $message): bool
    {
        $normalized = mb_strtolower($message);

        // Avoid treating action-creation prompts as advice requests.
        if ($this->looksLikeCreateLeadActionRequest($normalized) || $this->looksLikeCreateTaskRequest($normalized)) {
            return false;
        }

        return (bool) preg_match(
            '/(suggest|best fit|best item|best project|recommend|tips|advice|\x{0646}\x{0635}\x{064A}\x{062D}\x{0629}|\x{0646}\x{0635}\x{0627}\x{064A}\x{062D}|smart follow-up|\x{0627}\x{062F}\x{064A}\x{0646}\x{064A}\s*\x{0646}\x{0635}\x{064A}\x{062D}\x{0629})/iu',
            $normalized
        );
    }

    protected function looksLikeDelayedLeadSelection(string $message): bool
    {
        $normalized = mb_strtolower($message);

        return (bool) preg_match(
            '/(?:\x{0627}\x{062E}\x{062A}\x{0627}\x{0631}|\x{0627}\x{062E}\x{062A}\x{0631}|\x{0627}\x{0628}\x{062F}\x{0623}|\x{0627}\x{0628}\x{062F}\x{0627}|start with|choose one|pick one|work on|focus on|\x{0627}\x{0633}\x{062A}\x{062B}\x{0645}\x{0631}|invest)/iu',
            $normalized
        );
    }

    protected function resolveLatestDelayedLeads(?AiCopilotConversation $conversation): ?array
    {
        if (! $conversation || ! Schema::hasTable('ai_copilot_messages')) {
            return null;
        }

        $message = AiCopilotMessage::query()
            ->where('conversation_id', $conversation->id)
            ->where('tool_name', 'list_delayed_leads')
            ->latest('id')
            ->first();

        return is_array($message?->tool_payload) ? $message->tool_payload : null;
    }

    protected function buildDelayedLeadChoicePrompt(array $leads, string $locale = 'en'): array
    {
        $uiActions = array_map(function ($lead) use ($locale) {
            $id = (int) ($lead['id'] ?? 0);
            $title = ($lead['name'] ?? '') !== '' ? (string) $lead['name'] : ('Lead #'.$id);

            return [
                'type' => 'lead_card',
                'lead_id' => $id,
                'title' => $title,
                'subtitle' => trim(($lead['stage'] ?? '').' · '.($lead['assigned_name'] ?? ($locale === 'ar' ? 'غير معيّن' : 'Unassigned'))),
                'prompt_message' => $locale === 'ar'
                    ? 'اديني نصيحة متابعة ذكية لليد '.$id
                    : 'Give me smart follow-up advice for lead '.$id,
                'prompt_label' => ($locale === 'ar' ? 'ابدأ بـ ' : 'Start with ').$title,
            ];
        }, array_values(array_filter($leads, fn ($lead) => (int) ($lead['id'] ?? 0) > 0)));

        return [
            'message' => $locale === 'ar'
                ? 'تمام — اختار ليد من الكروت تحت عشان أديك نصيحة متابعة وأفتحه معاك.'
                : 'Sure — pick a lead from the cards below so I can give follow-up advice and open it with you.',
            'ui_actions' => $uiActions,
        ];
    }

    protected function buildLeadFocusReply(User $user, int $leadId, string $locale = 'en'): ?array
    {
        if ($leadId <= 0 || ! Schema::hasTable('leads')) {
            return null;
        }

        $lead = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $leadId)
            ->first();

        if (! $lead) {
            return [
                'message' => $locale === 'ar'
                    ? 'الليد مش موجود للمستأجر ده.'
                    : 'Lead not found for this tenant.',
                'ui_actions' => [],
            ];
        }

        $tenant = Tenant::find($user->tenant_id);
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? 'general')));
        $isGeneral = $companyType === 'general';
        $choices = $isGeneral
            ? Item::query()->where('tenant_id', $user->tenant_id)->orderBy('name')->limit(10)->get(['id', 'name'])
            : Project::query()->where('tenant_id', $user->tenant_id)->orderBy('name')->limit(10)->get(['id', 'name']);

        $choiceLabel = $isGeneral ? 'item' : 'project';
        $suggestions = collect($choices)->map(fn ($choice) => '#'.$choice->id.' '.$choice->name)->values()->all();
        $advice = $this->generateLeadAdviceText($lead, $suggestions, $choiceLabel, $locale);
        $title = $lead->name ?: ('Lead #'.$lead->id);
        $taskPayload = [
            'lead_id' => $lead->id,
            'title' => $locale === 'ar'
                ? ('متابعة ليد #'.$lead->id)
                : ('Follow up lead #'.$lead->id),
            'description' => $locale === 'ar'
                ? ('متابعة الليد المتأخر: '.($lead->name ?: ('#'.$lead->id)))
                : ('Follow up delayed lead: '.($lead->name ?: ('#'.$lead->id))),
            'priority' => 'medium',
            'status' => 'pending',
            'assigned_to' => $lead->assigned_to ?: $user->id,
            'related_to' => 'lead',
            'related_ref' => (string) $lead->id,
        ];

        return [
            'message' => $advice,
            'ui_actions' => [
                [
                    'type' => 'navigate',
                    'path' => '/leads?lead_id='.$lead->id.'&tab=overview',
                    'pathname' => '/leads',
                    'search' => '?lead_id='.$lead->id.'&tab=overview',
                    'label' => $locale === 'ar' ? 'افتح الليد' : 'Open lead',
                ],
                [
                    'type' => 'prompt_message',
                    'message' => $locale === 'ar'
                        ? 'ابدأ أكشن على الليد '.$lead->id
                        : 'Start an action on lead '.$lead->id,
                    'display_text' => ($locale === 'ar' ? 'ابدأ أكشن لـ ' : 'Start action for ').$title,
                    'label' => $locale === 'ar' ? 'ابدأ أكشن' : 'Start action',
                ],
                [
                    'type' => 'confirm_action',
                    'action' => 'create_task_for_lead',
                    'payload' => $taskPayload,
                    'label' => $locale === 'ar' ? 'إنشاء تاسك' : 'Create task',
                ],
            ],
        ];
    }

    protected function generateLeadAdviceText(Lead $lead, array $suggestions, string $choiceLabel, string $locale = 'en'): string
    {
        $fallback = $this->buildFallbackLeadAdvice($lead, $suggestions, $choiceLabel, $locale);
        $apiKey = (string) config('services.gemini.api_key', '');

        if ($apiKey === '') {
            return $fallback;
        }

        $options = $suggestions !== []
            ? implode(', ', $suggestions)
            : ($locale === 'ar'
                ? 'مفيش خيارات '.$choiceLabel.' متاحة حالياً في المستأجر.'
                : 'No '.$choiceLabel.' options are available in this tenant right now.');
        $replyLanguage = $locale === 'ar' ? 'Arabic' : 'English';
        $prompt = <<<PROMPT
You are Besouhola Copilot helping a CRM user after creating a lead.
Only use the provided tenant options. Never invent an item or project outside the list.
Write the entire answer in {$replyLanguage}.
Do NOT use markdown. No asterisks, no bold markers, no bullet markdown.
Write a concise plain-text answer with:
1. A best-fit {$choiceLabel} recommendation from the provided options only.
2. Why it fits this lead.
3. 3 short follow-up tips for the sales user.

Lead:
- Name: {$lead->name}
- Phone: {$lead->phone}
- Email: {$lead->email}
- Source: {$lead->source}
- Company: {$lead->company}
- Country: {$lead->country}

Tenant {$choiceLabel} options:
{$options}
PROMPT;

        try {
            $response = Http::timeout(25)
                ->post($this->geminiGenerateContentUrl($apiKey), [
                    'contents' => [[
                        'role' => 'user',
                        'parts' => [['text' => $prompt]],
                    ]],
                ]);

            if (! $response->successful()) {
                return $fallback;
            }

            $text = trim((string) data_get($response->json(), 'candidates.0.content.parts.0.text', ''));

            return $text !== '' ? $text : $fallback;
        } catch (\Throwable) {
            return $fallback;
        }
    }

    protected function geminiGenerateContentUrl(string $apiKey): string
    {
        $model = trim((string) config('services.gemini.model', 'gemini-3.6-flash'));
        if ($model === '') {
            $model = 'gemini-3.6-flash';
        }

        return 'https://generativelanguage.googleapis.com/v1beta/models/'
            .rawurlencode($model)
            .':generateContent?key='
            .urlencode($apiKey);
    }

    protected function buildFallbackLeadAdvice(Lead $lead, array $suggestions, string $choiceLabel, string $locale = 'en'): string
    {
        $topSuggestion = $suggestions[0] ?? null;
        $lines = [];

        if ($locale === 'ar') {
            $lines[] = 'الليد '.$lead->id.' جاهز.';
            if ($topSuggestion) {
                $lines[] = 'أفضل اقتراح '.$choiceLabel.': '.$topSuggestion.'.';
            } else {
                $lines[] = 'مفيش اقتراحات '.$choiceLabel.' متاحة حالياً في المستأجر.';
            }
            $source = $lead->source ?: 'مصدر غير معروف';
            $lines[] = 'ابدأ بتأكيد الميزانية والتايملاين والاحتياج الأساسي لليد من '.$source.'.';
            $lines[] = 'في أول متابعة تأكد من متخذ القرار ووقت التواصل المناسب ومدى الاستعجال.';
            $lines[] = 'لو الليد متجاوب، سجّل الأكشن التالي فوراً عشان البايبلاين يفضل مرتب.';

            return implode("\n", $lines);
        }

        $lines[] = 'Lead '.$lead->id.' is ready.';

        if ($topSuggestion) {
            $lines[] = 'Best-fit '.$choiceLabel.' suggestion: '.$topSuggestion.'.';
        } else {
            $lines[] = 'No '.$choiceLabel.' suggestions are available in this tenant yet.';
        }

        $source = $lead->source ?: 'unknown source';
        $lines[] = 'Start by confirming budget, timeline, and the main need for this '.$source.' lead.';
        $lines[] = 'Use the first follow-up to validate decision maker, preferred contact time, and deal urgency.';
        $lines[] = 'If the lead engages well, log the next action immediately so the pipeline stays clean.';

        return implode("\n", $lines);
    }

    protected function extractJson(string $text): ?array
    {
        $start = strpos($text, '{');
        $end = strrpos($text, '}');
        if ($start === false || $end === false || $end < $start) {
            return null;
        }

        $decoded = json_decode(substr($text, $start, $end - $start + 1), true);

        return is_array($decoded) ? $decoded : null;
    }
}














