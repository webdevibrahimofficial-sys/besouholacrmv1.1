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
Available reports: {$reports}

Return ONLY JSON:
{"tool":"tool_name_or_none","args":{},"reply":"optional direct reply if tool is none"}

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
        $map = [
            'pipeline' => 'leads_pipeline',
            'activit' => 'sales_activities',
            'meeting' => 'meetings',
            'closed' => 'closed_deals',
            'customer' => 'customers',
            'export' => 'exports',
            'cancel' => 'cancellation',
            'بايبلاين' => 'leads_pipeline',
            'انشطة' => 'sales_activities',
            'اجتماعات' => 'meetings',
            'صفقات' => 'closed_deals',
            'عملاء' => 'customers',
            'الغاء' => 'cancellation',
        ];

        foreach ($map as $needle => $key) {
            if (str_contains($text, $needle)) {
                return $key;
            }
        }

        return null;
    }

    protected function guessDates(string $text): array
    {
        $args = [];
        if (preg_match('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $from)) {
            $args['date_from'] = $from[1];
        }
        if (preg_match_all('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $all) && count($all[1]) > 1) {
            $args['date_from'] = $all[1][0];
            $args['date_to'] = $all[1][1];
        }
        if (str_contains($text, 'today') || str_contains($text, 'اليوم')) {
            $args['date_from'] = now()->toDateString();
            $args['date_to'] = now()->toDateString();
        }
        if (str_contains($text, 'this month') || str_contains($text, 'هذا الشهر')) {
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
            'navigate_report' => 'Opening '.($result['report'] ?? 'the report').'.',
            'export_report' => (string) ($result['message'] ?? 'Export is ready.'),
            'list_delayed_leads' => 'Found '.((int) ($result['count'] ?? 0)).' delayed leads.',
            'create_task_for_lead' => (string) ($result['message'] ?? 'Task draft ready.'),
            default => 'Done.',
        };
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
