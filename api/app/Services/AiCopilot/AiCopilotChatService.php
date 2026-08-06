<?php

namespace App\Services\AiCopilot;

use App\Models\AiCopilotConversation;
use App\Models\AiCopilotMessage;
use App\Models\Item;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AiCopilotChatService
{
    public function __construct(
        private readonly AiSystemCatalog $catalog,
        private readonly AiCopilotToolExecutor $tools
    ) {
    }

    public function chat(User $user, string $message, ?int $conversationId = null): array
    {
        $conversation = $this->resolveConversation($user, $conversationId);
        $this->storeMessage($conversation, 'user', $message);

        $toolResult = null;
        $uiActions = [];
        $assistantText = '';
        $planned = ['tool' => null, 'args' => []];
        $pendingLeadDraft = $this->resolvePendingLeadDraft($conversation);
        $pendingOptionalLeadDraft = $this->resolvePendingOptionalLeadDraft($conversation);
        $optionalStartDraft = $this->shouldStartOptionalLeadDraft($conversation, $message);
        $adviceReply = $this->handleLeadAdviceIntent($user, $message);

        if ($adviceReply) {
            $assistantText = $adviceReply['message'];
            $uiActions = $adviceReply['ui_actions'] ?? [];
        } else {
            if ($pendingOptionalLeadDraft) {
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
                $planned = $this->planWithGemini($user, $message);
                if (! $planned) {
                    $planned = $this->planWithHeuristics($message);
                } else {
                    $planned = $this->enrichPlanWithHeuristicDates($planned, $message);
                }
            }

            if (in_array(($planned['tool'] ?? null), ['navigate_report', 'export_report', 'build_report_filters'], true)) {
                $planned = $this->enrichPlanWithHeuristicDates($planned, $message);
            }

            if (($planned['tool'] ?? null) && $planned['tool'] !== 'none') {
                $toolResult = $this->tools->execute($user, $planned['tool'], $planned['args'] ?? []);
                $uiActions = $toolResult['ui_actions'] ?? [];
                $assistantText = $this->composeToolReply($planned['tool'], $toolResult, $message);
                $this->storeMessage($conversation, 'tool', $assistantText, $planned['tool'], $toolResult, $uiActions);
            } else {
                $assistantText = $planned['reply']
                    ?? $this->defaultReply($user, $message);
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
        ];
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

    protected function planWithGemini(User $user, string $message): ?array
    {
        $apiKey = env('GEMINI_API_KEY');
        if (! $apiKey) {
            return null;
        }

        $catalog = $this->catalog->forUser($user);
        $toolNames = implode(', ', array_column($this->tools->definitions(), 'name'));
        $reports = collect($catalog['reports'])->map(fn ($r) => $r['key'].' ('.$r['name'].')')->implode(', ');

        $prompt = <<<PROMPT
You are Besouhola Copilot, a CRM assistant.
Choose at most one tool for the user request, or none for a direct answer.
Available tools: {$toolNames}
Available reports for this user: {$reports}

Return ONLY JSON:
{"tool":"tool_name_or_none","args":{},"reply":"optional direct reply if tool is none"}

When opening/filtering a report, set args.report to the exact report key from the available list.
When filtering reports, always put ISO dates in args as date_from and date_to (YYYY-MM-DD).
If the user writes dates like 1/8/2025 treat them as day/month/year.
Never invent a report that is not in the available list.

User message:
{$message}
PROMPT;

        try {
            $response = Http::timeout(25)
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={$apiKey}", [
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

    protected function planWithHeuristics(string $message): array
    {
        $text = mb_strtolower($message);

        if (preg_match('/(delayed|delay|ديلاي|متأخر)/u', $text)) {
            $workflow = preg_match('/telesales|تيلي/u', $text) ? 'telesales' : 'sales';

            return [
                'tool' => 'list_delayed_leads',
                'args' => ['workflow_key' => $workflow, 'limit' => 10],
            ];
        }

        if ($this->looksLikeLeadCreationRequest($text)) {
            return [
                'tool' => 'create_lead_draft',
                'args' => $this->guessLeadArgs($message),
            ];
        }

        if (preg_match('/(action|follow[ -_]?up|meeting|comment|note)/u', $text)) {
            return [
                'tool' => 'create_lead_action_draft',
                'args' => $this->guessLeadActionArgs($message),
            ];
        }
        if (preg_match('/(task|تاسك|مهمة)/u', $text) && preg_match('/\b(\d+)\b/', $text, $m)) {
            return [
                'tool' => 'create_task_for_lead',
                'args' => [
                    'lead_id' => (int) $m[1],
                    'title' => 'Follow up delayed lead #'.$m[1],
                ],
            ];
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

        if (preg_match('/(what can|capabilities|تقدر|اقدر|help|مساعد|سيستم|system|features)/u', $text)) {
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

        $lower = mb_strtolower($text);
        if (str_contains($lower, 'today') || str_contains($text, 'اليوم')) {
            $args['date_from'] = now()->toDateString();
            $args['date_to'] = now()->toDateString();
        }
        if (str_contains($lower, 'this month') || str_contains($text, 'هذا الشهر')) {
            $args['date_from'] = now()->startOfMonth()->toDateString();
            $args['date_to'] = now()->toDateString();
        }

        return $args;
    }

    protected function composeToolReply(string $tool, array $result, string $message): string
    {
        if (! ($result['ok'] ?? false)) {
            return (string) ($result['message'] ?? 'I could not complete that request.');
        }

        return match ($tool) {
            'list_capabilities' => (string) ($result['summary'] ?? 'Here are the available capabilities.'),
            'explain_feature' => trim(($result['topic'] ?? 'Feature').': '.($result['explanation'] ?? '')),
            'navigate_report' => $this->composeNavigateReply($result),
            'export_report' => (string) ($result['message'] ?? 'Export is ready.'),
            'list_delayed_leads' => 'Found '.((int) ($result['count'] ?? 0)).' delayed leads.',
            'create_lead_draft' => (string) ($result['message'] ?? 'Lead draft ready.'),
            'create_lead_action_draft' => (string) ($result['message'] ?? 'Lead action draft ready.'),
            'create_task_for_lead' => (string) ($result['message'] ?? 'Task draft ready.'),
            default => 'Done.',
        };
    }

    protected function composeNavigateReply(array $result): string
    {
        $report = (string) ($result['report'] ?? 'the report');
        $filters = is_array($result['filters'] ?? null) ? $result['filters'] : [];
        $from = $filters['created_from'] ?? $filters['date_from'] ?? null;
        $to = $filters['created_to'] ?? $filters['date_to'] ?? null;

        if ($from && $to) {
            return "Opening {$report} filtered from {$from} to {$to}.";
        }

        if ($from) {
            return "Opening {$report} filtered from {$from}.";
        }

        return "Opening {$report}.";
    }

    protected function defaultReply(User $user, string $message): string
    {
        $catalog = $this->catalog->forUser($user);
        $reportNames = collect($catalog['reports'])->pluck('name')->take(5)->implode(', ');

        return "I'm Besouhola Copilot. I can help with reports ({$reportNames}), delayed leads, leads, lead actions, and tasks. Ask me to open a report, export one, create a lead, create a lead action, or list delayed leads.";
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

    protected function guessLeadActionArgs(string $message): array
    {
        $text = mb_strtolower($message);
        $args = [];

        if (preg_match('/\b(\d+)\b/', $text, $match)) {
            $args['lead_id'] = (int) $match[1];
        }

        if (preg_match('/(follow[ -_]?up|Ù…ØªØ§Ø¨Ø¹Ø©)/u', $text)) {
            $args['type'] = 'follow_up';
        } elseif (preg_match('/(meeting|Ø§Ø¬ØªÙ…Ø§Ø¹)/u', $text)) {
            $args['type'] = 'meeting';
        } elseif (preg_match('/(comment|ØªØ¹Ù„ÙŠÙ‚)/u', $text)) {
            $args['type'] = 'comment';
        } elseif (preg_match('/(note|Ù…Ù„Ø§Ø­Ø¸Ø©)/u', $text)) {
            $args['type'] = 'note';
        }

        $dates = $this->guessDates($message);
        if (isset($dates['date_from'])) {
            $args['date'] = $dates['date_from'];
        }

        if (str_contains($text, 'tomorrow') || str_contains($text, 'Ø¨ÙƒØ±Ø©') || str_contains($text, 'ØºØ¯Ø§')) {
            $args['date'] = now()->addDay()->toDateString();
        }

        if (preg_match('/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i', $message, $timeMatch)) {
            $hour = (int) $timeMatch[1];
            $minute = isset($timeMatch[2]) ? (int) $timeMatch[2] : 0;
            $meridiem = strtolower((string) ($timeMatch[3] ?? ''));

            if ($meridiem === 'pm' && $hour < 12) {
                $hour += 12;
            }
            if ($meridiem === 'am' && $hour === 12) {
                $hour = 0;
            }

            $args['time'] = sprintf('%02d:%02d', $hour, $minute);
        }

        return $args;
    }

    protected function handleLeadAdviceIntent(User $user, string $message): ?array
    {
        if (! Schema::hasTable('leads') || ! preg_match('/\b(?:lead)\s+(\d+)\b/i', $message, $match)) {
            return null;
        }

        $leadId = (int) $match[1];
        if ($leadId <= 0) {
            return null;
        }

        $lead = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $leadId)
            ->first();

        if (! $lead) {
            return [
                'message' => 'Lead not found for this tenant.',
                'ui_actions' => [],
            ];
        }

        $normalized = mb_strtolower($message);
        if (
            ! preg_match('/(suggest|best fit|best item|best project|recommend|tips|advice|follow up|follow\\-up)/i', $normalized)
        ) {
            return null;
        }

        $tenant = Tenant::find($user->tenant_id);
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? 'general')));
        $isGeneral = $companyType === 'general';
        $choices = $isGeneral
            ? Item::query()->where('tenant_id', $user->tenant_id)->orderBy('name')->limit(10)->get(['id', 'name'])
            : Project::query()->where('tenant_id', $user->tenant_id)->orderBy('name')->limit(10)->get(['id', 'name']);

        $choiceLabel = $isGeneral ? 'item' : 'project';
        $suggestions = collect($choices)->map(fn ($choice) => '#'.$choice->id.' '.$choice->name)->values()->all();
        $advice = $this->generateLeadAdviceText($lead, $suggestions, $choiceLabel);

        return [
            'message' => $advice,
            'ui_actions' => [
                [
                    'type' => 'navigate',
                    'path' => '/leads/'.$lead->id,
                    'label' => 'Open lead',
                ],
            ],
        ];
    }

    protected function generateLeadAdviceText(Lead $lead, array $suggestions, string $choiceLabel): string
    {
        $fallback = $this->buildFallbackLeadAdvice($lead, $suggestions, $choiceLabel);
        $apiKey = env('GEMINI_API_KEY');

        if (! $apiKey) {
            return $fallback;
        }

        $options = $suggestions !== [] ? implode(', ', $suggestions) : 'No '.$choiceLabel.' options are available in this tenant right now.';
        $prompt = <<<PROMPT
You are Besouhola Copilot helping a CRM user after creating a lead.
Only use the provided tenant options. Never invent an item or project outside the list.
Write a concise answer with:
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
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={$apiKey}", [
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

    protected function buildFallbackLeadAdvice(Lead $lead, array $suggestions, string $choiceLabel): string
    {
        $topSuggestion = $suggestions[0] ?? null;
        $lines = [];
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














