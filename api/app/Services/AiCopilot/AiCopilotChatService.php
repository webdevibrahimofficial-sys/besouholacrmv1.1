<?php

namespace App\Services\AiCopilot;

use App\Models\AiCopilotConversation;
use App\Models\AiCopilotMessage;
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

        $planned = $this->planWithGemini($user, $message);
        if (! $planned) {
            $planned = $this->planWithHeuristics($message);
        } else {
            $planned = $this->enrichPlanWithHeuristicDates($planned, $message);
        }

        // Always re-apply explicit dates from the user text for filter intents.
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

        // Explicit dates in the user message always win over model guesses.
        foreach ($dates as $key => $value) {
            $args[$key] = $value;
        }

        $guessedReport = $this->guessReport($message);
        if ($guessedReport) {
            $args['report'] = $guessedReport;
        } elseif (! isset($args['report']) || $args['report'] === '') {
            // Only fall back when the user did not name a specific report.
            $args['report'] = 'leads_pipeline';
        }

        // If Gemini invented a report key, prefer the catalog guess when available.
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

                // Prefer d/m/Y (common in AR locales). Swap if clearly m/d/Y.
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

        return "I'm Besouhola Copilot. I can help with reports ({$reportNames}), delayed leads, and tasks. Ask me to open a report, export one, or list delayed leads.";
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
