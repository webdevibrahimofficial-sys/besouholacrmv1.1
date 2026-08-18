<?php

namespace App\Services\AiCopilot;

use App\Http\Resources\FinancialEvaluationResource;
use App\Models\User;
use Illuminate\Support\Str;

class CopilotFinancialDecisionGate extends AiCopilotChatService
{
    public function __construct(
        AiSystemCatalog $catalog,
        AiCopilotToolExecutor $tools,
        IntegrationGuideService $integrationGuides,
        private readonly FinancialDecisionCopilotHandler $financial,
    ) {
        parent::__construct($catalog, $tools, $integrationGuides);
    }

    public function chat(User $user, string $message, ?int $conversationId = null, ?string $preferredLocale = null): array
    {
        if ($this->financial->shouldIntercept($user, $message)) {
            $conversation = $this->resolveConversation($user, $conversationId);
            $this->storeMessage($conversation, 'user', $message);

            $result = $this->financial->evaluateForCopilot($user, $message, $conversation?->id ?? $conversationId, $preferredLocale);
            $toolResult = FinancialEvaluationResource::stripTrace(is_array($result['tool_result'] ?? null) ? $result['tool_result'] : []);
            $messageText = (string) ($result['message'] ?? '');

            $this->storeMessage($conversation, 'tool', $messageText, 'evaluate_financial_offer', $toolResult);
            $this->storeMessage($conversation, 'assistant', $messageText, 'evaluate_financial_offer', $toolResult);

            if ($conversation) {
                $conversation->update([
                    'title' => $conversation->title ?: Str::limit($message, 60),
                    'last_message_at' => now(),
                ]);
            }

            return [
                'conversation_id' => $conversation?->id,
                'message' => $messageText,
                'tool' => 'evaluate_financial_offer',
                'tool_result' => $toolResult,
                'ui_actions' => [],
                'locale' => $result['locale'] ?? 'en',
            ];
        }

        return parent::chat($user, $message, $conversationId, $preferredLocale);
    }
}
