<?php

namespace App\Services\AiCopilot;

use App\Http\Resources\FinancialEvaluationResource;
use App\Models\Tenant;
use App\Models\User;
use App\Services\FinancialDecision\FinancialDecisionService;
use App\Services\FinancialDecision\FinancialRequestParser;
use App\Services\TenantFeatureService;

final class FinancialDecisionCopilotHandler
{
    public function __construct(
        private readonly FinancialDecisionService $decisions,
        private readonly FinancialRequestParser $parser,
        private readonly TenantFeatureService $features,
    ) {
    }

    public function shouldIntercept(User $user, string $message): bool
    {
        if (! $this->featureEnabled($user)) {
            return false;
        }

        return $this->looksFinancial($message);
    }

    public function evaluateForCopilot(User $user, string $message, ?int $conversationId, ?string $preferredLocale): array
    {
        $locale = $this->locale($preferredLocale, $message);
        $structured = $this->parser->parse($message, $locale);
        if (! $structured->leadId && $conversationId) {
            $fromContext = $this->leadIdFromConversation($conversationId);
            if ($fromContext) {
                $payload = $structured->toArray();
                $payload['lead_id'] = $fromContext;
                $structured = $this->parser->fromArray($payload);
            }
        }

        $result = $this->decisions->evaluate($user, $structured, $locale);

        return [
            'conversation_id' => $conversationId,
            'message' => (string) ($result['message'] ?? ''),
            'tool' => 'evaluate_financial_offer',
            'tool_result' => FinancialEvaluationResource::stripTrace($result),
            'ui_actions' => [],
            'locale' => $locale,
        ];
    }

    public function looksFinancial(string $message): bool
    {
        $text = mb_strtolower($message);

        if (preg_match('/(delayed|delay|ديلاي|متأخر|ليدز المتأخر|create\s+lead|أنشئ\s*ليد|__copilot_)/u', $text)) {
            return false;
        }

        return (bool) preg_match(
            '/(العرض|هل العرض|مقبول|خصم|مقدم|تقسيط|خطة دفع|قسط|npv|evaluate offer|down\s*payment|discount|payment plan|afford)/u',
            $text
        );
    }

    private function featureEnabled(User $user): bool
    {
        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if (! $tenant instanceof Tenant && $user->tenant_id) {
            $tenant = Tenant::query()->find($user->tenant_id);
        }

        if (! $tenant instanceof Tenant) {
            return false;
        }

        return $this->features->tenantHasFeature($tenant, 'financial_decision_engine');
    }

    private function locale(?string $preferred, string $message): string
    {
        if (preg_match('/\p{Arabic}/u', $message)) {
            return 'ar';
        }

        $normalized = strtolower((string) $preferred);

        return str_starts_with($normalized, 'ar') ? 'ar' : 'en';
    }

    private function leadIdFromConversation(int $conversationId): ?int
    {
        if (! class_exists(\App\Models\AiCopilotMessage::class)) {
            return null;
        }

        $rows = \App\Models\AiCopilotMessage::query()
            ->where('conversation_id', $conversationId)
            ->where('role', 'user')
            ->latest('id')
            ->limit(6)
            ->get(['content']);

        foreach ($rows as $row) {
            $content = (string) ($row->content ?? '');
            if (preg_match('/(?:\blead\s*#?\s*|#\s*|ليد\s*(?:رقم|#)?\s*)(\d+)/iu', $content, $match)) {
                return (int) $match[1];
            }
        }

        return null;
    }
}
