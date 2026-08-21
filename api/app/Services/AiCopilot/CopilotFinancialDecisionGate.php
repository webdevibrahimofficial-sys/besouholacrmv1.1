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
            $toolName = (string) ($result['tool'] ?? 'evaluate_financial_offer');

            $this->storeMessage($conversation, 'tool', $messageText, $toolName, $toolResult);
            $this->storeMessage($conversation, 'assistant', $messageText, $toolName, $toolResult);

            if ($conversation) {
                $conversation->update([
                    'title' => $conversation->title ?: Str::limit($message, 60),
                    'last_message_at' => now(),
                ]);
            }

            return [
                'conversation_id' => $conversation?->id,
                'message' => $messageText,
                'tool' => $toolName,
                'tool_result' => $toolResult,
                'ui_actions' => is_array($result['ui_actions'] ?? null) ? $result['ui_actions'] : [],
                'locale' => $result['locale'] ?? 'en',
            ];
        }

        return parent::chat($user, $message, $conversationId, $preferredLocale);
    }
}
