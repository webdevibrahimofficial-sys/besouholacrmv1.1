<?php

namespace App\Services\AiCopilot;

use App\Models\AiCopilotConversation;
use App\Models\AiCopilotMessage;
use App\Models\AiCopilotNotification;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

class CopilotNotificationService
{
    public function __construct(
        private readonly CopilotNotificationTimeBucket $timeBucket,
        private readonly CopilotNotificationPreviewBuilder $previewBuilder,
        private readonly CopilotLeadIntelligenceService $intelligence,
        private readonly CopilotLeadRescueService $rescue,
        private readonly CopilotLeadEscalationService $escalation,
        private readonly CopilotLeadLostDetectiveService $lostDetective,
        private readonly CopilotLeadNarrationService $narration,
        private readonly CopilotAudienceResolver $audience,
    ) {
    }

    public function enqueueLeadIntelligence(User $user, int $leadId, string $source = 'copilot', string $locale = 'en'): array
    {
        if ($leadId <= 0 || ! Schema::hasTable('ai_copilot_notifications')) {
            return ['ok' => false, 'reason' => 'invalid_lead'];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'reason' => 'not_visible',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        $analysis = $this->intelligence->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return [
                'ok' => false,
                'reason' => $analysis['reason'] ?? 'analysis_failed',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        return $this->enqueueFromAnalysis(
            $user,
            $leadId,
            CopilotNotificationTimeBucket::TYPE_LEAD_INTELLIGENCE,
            $analysis,
            $locale
        );
    }

    public function enqueueLeadRescue(User $user, int $leadId, string $source = 'copilot:rescue', string $locale = 'en'): array
    {
        if ($leadId <= 0 || ! Schema::hasTable('ai_copilot_notifications')) {
            return ['ok' => false, 'reason' => 'invalid_lead'];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'reason' => 'not_visible',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        $analysis = $this->rescue->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return [
                'ok' => false,
                'reason' => $analysis['reason'] ?? 'analysis_failed',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        return $this->enqueueFromAnalysis(
            $user,
            $leadId,
            CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE,
            $analysis,
            $locale
        );
    }

    public function scanLeadRescue(User $user, string $locale = 'en', int $limit = 5, string $workflow = 'sales'): array
    {
        $candidates = $this->rescue->findRescueCandidates($user, max($limit, 1), $workflow);
        $created = 0;
        $skipped = 0;
        $notWorthy = 0;
        $results = [];

        foreach ($candidates as $lead) {
            $result = $this->enqueueLeadRescue($user, (int) $lead->id, 'copilot:rescue-scan', $locale);
            $results[] = [
                'lead_id' => (int) $lead->id,
                'ok' => (bool) ($result['ok'] ?? false),
                'created' => (bool) ($result['created'] ?? false),
                'reason' => $result['reason'] ?? null,
            ];

            if (! ($result['ok'] ?? false)) {
                if (($result['reason'] ?? '') === 'not_rescue_worthy') {
                    $notWorthy++;
                }
                continue;
            }

            if ($result['created'] ?? false) {
                $created++;
            } else {
                $skipped++;
            }
        }

        return [
            'ok' => true,
            'scanned' => count($candidates),
            'created' => $created,
            'skipped' => $skipped,
            'not_rescue_worthy' => $notWorthy,
            'unread_count' => $this->unreadCount($user),
            'results' => $results,
        ];
    }

    public function enqueueLeadEscalation(User $user, int $leadId, string $source = 'copilot:escalation', string $locale = 'en'): array
    {
        if ($leadId <= 0 || ! Schema::hasTable('ai_copilot_notifications')) {
            return ['ok' => false, 'reason' => 'invalid_lead'];
        }

        if (! $this->escalation->canReceiveEscalations($user)) {
            return [
                'ok' => false,
                'reason' => 'not_escalation_audience',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'reason' => 'not_visible',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        $analysis = $this->escalation->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return [
                'ok' => false,
                'reason' => $analysis['reason'] ?? 'analysis_failed',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        return $this->enqueueFromAnalysis(
            $user,
            $leadId,
            CopilotNotificationTimeBucket::TYPE_ESCALATION,
            $analysis,
            $locale
        );
    }

    public function scanLeadEscalation(User $user, string $locale = 'en', int $limit = 5, string $workflow = 'sales'): array
    {
        if (! $this->escalation->canReceiveEscalations($user)) {
            return [
                'ok' => true,
                'scanned' => 0,
                'created' => 0,
                'skipped' => 0,
                'not_escalation_worthy' => 0,
                'not_escalation_audience' => true,
                'unread_count' => $this->unreadCount($user),
                'results' => [],
            ];
        }

        $candidates = $this->escalation->findEscalationCandidates($user, max($limit, 1), $workflow);
        $created = 0;
        $skipped = 0;
        $notWorthy = 0;
        $results = [];

        foreach ($candidates as $lead) {
            $result = $this->enqueueLeadEscalation($user, (int) $lead->id, 'copilot:escalation-scan', $locale);
            $results[] = [
                'lead_id' => (int) $lead->id,
                'ok' => (bool) ($result['ok'] ?? false),
                'created' => (bool) ($result['created'] ?? false),
                'reason' => $result['reason'] ?? null,
            ];

            if (! ($result['ok'] ?? false)) {
                if (($result['reason'] ?? '') === 'not_escalation_worthy') {
                    $notWorthy++;
                }
                continue;
            }

            if ($result['created'] ?? false) {
                $created++;
            } else {
                $skipped++;
            }
        }

        return [
            'ok' => true,
            'scanned' => count($candidates),
            'created' => $created,
            'skipped' => $skipped,
            'not_escalation_worthy' => $notWorthy,
            'unread_count' => $this->unreadCount($user),
            'results' => $results,
        ];
    }

    public function enqueueLeadLostDetective(User $user, int $leadId, string $source = 'copilot:lost-detective', string $locale = 'en'): array
    {
        if ($leadId <= 0 || ! Schema::hasTable('ai_copilot_notifications')) {
            return ['ok' => false, 'reason' => 'invalid_lead'];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'reason' => 'not_visible',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        $analysis = $this->lostDetective->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return [
                'ok' => false,
                'reason' => $analysis['reason'] ?? 'analysis_failed',
                'unread_count' => $this->unreadCount($user),
            ];
        }

        return $this->enqueueFromAnalysis(
            $user,
            $leadId,
            CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE,
            $analysis,
            $locale
        );
    }

    public function scanLeadLostDetective(User $user, string $locale = 'en', int $limit = 5, string $workflow = 'sales'): array
    {
        $candidates = $this->lostDetective->findRecentlyLostCandidates($user, max($limit, 1), $workflow);
        $created = 0;
        $skipped = 0;
        $notLost = 0;
        $results = [];

        foreach ($candidates as $lead) {
            $result = $this->enqueueLeadLostDetective($user, (int) $lead->id, 'copilot:lost-detective-scan', $locale);
            $results[] = [
                'lead_id' => (int) $lead->id,
                'ok' => (bool) ($result['ok'] ?? false),
                'created' => (bool) ($result['created'] ?? false),
                'reason' => $result['reason'] ?? null,
            ];

            if (! ($result['ok'] ?? false)) {
                if (($result['reason'] ?? '') === 'not_lost_lead') {
                    $notLost++;
                }
                continue;
            }

            if ($result['created'] ?? false) {
                $created++;
            } else {
                $skipped++;
            }
        }

        return [
            'ok' => true,
            'scanned' => count($candidates),
            'created' => $created,
            'skipped' => $skipped,
            'not_lost_lead' => $notLost,
            'unread_count' => $this->unreadCount($user),
            'results' => $results,
        ];
    }

    protected function enqueueFromAnalysis(
        User $user,
        int $leadId,
        string $type,
        array $analysis,
        string $locale
    ): array {
        $bucket = $this->timeBucket->compute($type);
        $tenantId = (int) $user->tenant_id;
        $userId = (int) $user->id;
        $preview = $this->previewBuilder->build($analysis['payload'], $locale, $type);

        try {
            $notification = AiCopilotNotification::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $userId,
                'type' => $type,
                'lead_id' => $leadId,
                'time_bucket' => $bucket,
                'severity' => (string) ($analysis['severity'] ?? 'info'),
                'title' => (string) ($analysis['title'] ?? 'Lead Intelligence'),
                'preview' => $preview,
                'payload' => $analysis['payload'],
            ]);
            $created = true;
        } catch (QueryException) {
            $notification = AiCopilotNotification::query()
                ->where('tenant_id', $tenantId)
                ->where('user_id', $userId)
                ->where('type', $type)
                ->where('lead_id', $leadId)
                ->where('time_bucket', $bucket)
                ->first();

            if (! $notification) {
                throw new \RuntimeException('Failed to enqueue copilot notification.');
            }
            $created = false;
        }

        return [
            'ok' => true,
            'created' => $created,
            'notification' => $this->serializeNotification($notification),
            'unread_count' => $this->unreadCount($user),
        ];
    }

    protected function findVisibleLead(User $user, int $leadId): ?Lead
    {
        $lead = Lead::query()
            ->with('assignedAgent:id,name')
            ->where('id', $leadId)
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $lead || ! $this->audience->canView($user, $lead)) {
            return null;
        }

        return $lead;
    }

    public function listForUser(User $user, int $limit = 20): array
    {
        if (! Schema::hasTable('ai_copilot_notifications')) {
            return ['ok' => true, 'notifications' => [], 'unread_count' => 0];
        }

        $items = AiCopilotNotification::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->whereNull('dismissed_at')
            ->orderByDesc('created_at')
            ->limit(max(1, min($limit, 50)))
            ->get()
            ->map(fn (AiCopilotNotification $n) => $this->serializeNotification($n))
            ->values()
            ->all();

        return [
            'ok' => true,
            'notifications' => $items,
            'unread_count' => $this->unreadCount($user),
        ];
    }

    public function unreadCount(User $user): int
    {
        if (! Schema::hasTable('ai_copilot_notifications')) {
            return 0;
        }

        return (int) AiCopilotNotification::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->whereNull('dismissed_at')
            ->count();
    }

    public function markRead(User $user, int $notificationId): array
    {
        $notification = $this->findOwnedNotification($user, $notificationId);
        if (! $notification) {
            return ['ok' => false, 'message' => 'Notification not found.'];
        }

        if ($notification->read_at === null) {
            $notification->read_at = now();
            $notification->save();
        }

        return [
            'ok' => true,
            'unread_count' => $this->unreadCount($user),
        ];
    }

    public function dismiss(User $user, int $notificationId): array
    {
        $notification = $this->findOwnedNotification($user, $notificationId);
        if (! $notification) {
            return ['ok' => false, 'message' => 'Notification not found.'];
        }

        $notification->dismissed_at = now();
        if ($notification->read_at === null) {
            $notification->read_at = now();
        }
        $notification->save();

        return [
            'ok' => true,
            'unread_count' => $this->unreadCount($user),
        ];
    }

    public function open(User $user, int $notificationId, string $locale = 'en'): array
    {
        $notification = $this->findOwnedNotification($user, $notificationId);
        if (! $notification) {
            return ['ok' => false, 'message' => 'Notification not found.'];
        }

        $payload = is_array($notification->payload) ? $notification->payload : [];
        $reopened = $notification->conversation_id !== null;
        $lead = Lead::query()->with('assignedAgent:id,name')->find((int) $notification->lead_id);
        $uiActions = $lead
            ? $this->resolveUiActionsForNotification($notification, $lead, $payload, $locale)
            : [];

        if ($notification->conversation_id) {
            $conversation = AiCopilotConversation::query()
                ->where('id', $notification->conversation_id)
                ->where('user_id', $user->id)
                ->first();
            if (! $conversation) {
                $notification->conversation_id = null;
                $notification->save();
                $reopened = false;
            }
        }

        if (! $notification->conversation_id) {
            $conversation = AiCopilotConversation::create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'title' => $notification->title,
                'last_message_at' => now(),
            ]);

            $notification->conversation_id = $conversation->id;
            $notification->first_opened_at = now();
            $notification->save();

            $narration = $this->narration->render($payload, $locale);
            $toolName = $this->cardToolName((string) $notification->type);

            AiCopilotMessage::create([
                'conversation_id' => $conversation->id,
                'role' => 'assistant',
                'content' => $narration['content'],
                'tool_name' => $toolName,
                'tool_payload' => [
                    'notification_id' => $notification->id,
                    'facts' => $payload['facts'] ?? [],
                    'narration_source' => $narration['source'] ?? 'template',
                ],
                'ui_actions' => $uiActions,
            ]);
        }

        if ($notification->read_at === null) {
            $notification->read_at = now();
            $notification->save();
        }

        $card = $this->buildOpenCard($notification, $user, $locale, $uiActions);

        return [
            'ok' => true,
            'reopened' => $reopened,
            'conversation_id' => (int) $notification->conversation_id,
            'notification' => $this->serializeNotification($notification->fresh()),
            'card' => $card,
            'unread_count' => $this->unreadCount($user),
        ];
    }

    protected function buildOpenCard(
        AiCopilotNotification $notification,
        User $user,
        string $locale,
        array $fallbackUiActions = []
    ): array {
        $payload = is_array($notification->payload) ? $notification->payload : [];
        $seedContent = null;
        $uiActions = $fallbackUiActions;

        if ($notification->conversation_id && Schema::hasTable('ai_copilot_messages')) {
            $toolName = $this->cardToolName((string) $notification->type);
            $seed = AiCopilotMessage::query()
                ->where('conversation_id', $notification->conversation_id)
                ->where('tool_name', $toolName)
                ->orderBy('id')
                ->first();
            if ($seed) {
                $seedContent = trim((string) $seed->content);
                if (is_array($seed->ui_actions) && $seed->ui_actions !== []) {
                    $uiActions = $seed->ui_actions;
                }
            }
        }

        if ($seedContent === null || $seedContent === '') {
            $narration = $this->narration->render($payload, $locale);
            $seedContent = $narration['content'];
        } else {
            $narration = ['source' => 'stored'];
        }

        return [
            'title' => $notification->title,
            'content' => $seedContent,
            'facts' => $payload['facts'] ?? [],
            'recommendations' => $payload['recommendations'] ?? [],
            'signals' => $payload['signals'] ?? [],
            'ui_actions' => $uiActions,
            'narration_source' => $narration['source'] ?? 'template',
        ];
    }

    protected function resolveUiActionsForNotification(
        AiCopilotNotification $notification,
        Lead $lead,
        array $payload,
        string $locale
    ): array {
        return match ((string) $notification->type) {
            CopilotNotificationTimeBucket::TYPE_ESCALATION => $this->escalation->buildUiActionsForLead($lead, $payload, $locale),
            CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE => $this->lostDetective->buildUiActionsForLead($lead, $payload, $locale),
            CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE => $this->intelligence->buildUiActionsForLead($lead, $payload, $locale),
            default => $this->intelligence->buildUiActionsForLead($lead, $payload, $locale),
        };
    }

    protected function cardToolName(string $type): string
    {
        return match ($type) {
            CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE => 'lead_rescue_card',
            CopilotNotificationTimeBucket::TYPE_ESCALATION => 'lead_escalation_card',
            CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE => 'lost_detective_card',
            default => 'lead_intelligence_card',
        };
    }

    protected function findOwnedNotification(User $user, int $notificationId): ?AiCopilotNotification
    {
        if (! Schema::hasTable('ai_copilot_notifications')) {
            return null;
        }

        return AiCopilotNotification::query()
            ->where('id', $notificationId)
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->first();
    }

    protected function serializeNotification(AiCopilotNotification $notification): array
    {
        $payload = is_array($notification->payload) ? $notification->payload : [];

        return [
            'id' => (int) $notification->id,
            'type' => (string) $notification->type,
            'severity' => (string) $notification->severity,
            'title' => (string) $notification->title,
            'preview' => (string) $notification->preview,
            'lead_id' => (int) $notification->lead_id,
            'time_bucket' => (string) $notification->time_bucket,
            'conversation_id' => $notification->conversation_id ? (int) $notification->conversation_id : null,
            'read_at' => $notification->read_at?->toIso8601String(),
            'dismissed_at' => $notification->dismissed_at?->toIso8601String(),
            'created_at' => $notification->created_at?->toIso8601String(),
            'facts' => $payload['facts'] ?? [],
            'recommendations' => $payload['recommendations'] ?? [],
        ];
    }
}
