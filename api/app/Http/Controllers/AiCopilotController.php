<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\AiCopilot\AiCopilotChatService;
use App\Services\AiCopilot\AiCopilotToolExecutor;
use App\Services\AiCopilot\AiSystemCatalog;
use App\Services\AiCopilot\CopilotNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiCopilotController extends Controller
{
    public function __construct(
        private readonly AiCopilotChatService $chatService,
        private readonly AiCopilotToolExecutor $toolExecutor,
        private readonly AiSystemCatalog $catalog,
        private readonly CopilotNotificationService $notifications,
    ) {
    }

    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = app()->bound('current_tenant_id')
            ? app('current_tenant_id')
            : $user?->tenant_id;
        $tenant = $tenantId ? \App\Models\Tenant::find($tenantId) : null;

        return response()->json([
            'data' => [
                'feature' => 'besouhola_copilot',
                'enabled' => true,
                'tenant' => [
                    'id' => $tenant?->id,
                    'name' => $tenant?->name,
                    'slug' => $tenant?->slug,
                ],
                'user' => [
                    'id' => $user?->id,
                    'name' => $user?->name,
                    'email' => $user?->email,
                ],
                'message' => 'Besouhola Copilot is enabled for this workspace.',
                'quick_actions' => $user ? $this->resolveQuickActions($user) : [],
            ],
        ]);
    }

    public function chat(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:4000',
            'conversation_id' => 'nullable|integer',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $result = $this->chatService->chat(
            $request->user(),
            trim($validated['message']),
            $validated['conversation_id'] ?? null,
            $validated['locale'] ?? null
        );

        return response()->json(['data' => $result]);
    }

    public function confirmAction(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'action' => 'required|string|in:create_task_for_lead,create_lead_action,create_lead,assign_lead',
            'payload' => 'required|array',
        ]);

        $result = $this->toolExecutor->confirm(
            $request->user(),
            $validated['action'],
            $validated['payload']
        );

        return response()->json(['data' => $result], ($result['ok'] ?? false) ? 200 : 403);
    }

    public function listNotifications(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $locale = $this->resolveLocale($request);

        return response()->json([
            'data' => $this->notifications->listForUser(
                $request->user(),
                (int) ($validated['limit'] ?? 20)
            ),
        ]);
    }

    public function unreadNotificationCount(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [
                'ok' => true,
                'unread_count' => $this->notifications->unreadCount($request->user()),
            ],
        ]);
    }

    public function enqueueLeadIntelligence(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lead_id' => 'required|integer|min:1',
            'source' => 'nullable|string|max:64',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->enqueueLeadIntelligence(
            $request->user(),
            (int) $validated['lead_id'],
            (string) ($validated['source'] ?? 'copilot'),
            $locale
        );

        $status = ($result['ok'] ?? false) ? 200 : 403;

        return response()->json(['data' => $result], $status);
    }

    public function enqueueLeadRescue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lead_id' => 'required|integer|min:1',
            'source' => 'nullable|string|max:64',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->enqueueLeadRescue(
            $request->user(),
            (int) $validated['lead_id'],
            (string) ($validated['source'] ?? 'copilot:rescue'),
            $locale
        );

        $status = ($result['ok'] ?? false) ? 200 : 403;

        return response()->json(['data' => $result], $status);
    }

    public function scanLeadRescue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => 'nullable|integer|min:1|max:25',
            'workflow' => 'nullable|string|in:sales,telesales',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->scanLeadRescue(
            $request->user(),
            $locale,
            (int) ($validated['limit'] ?? 5),
            (string) ($validated['workflow'] ?? 'sales')
        );

        return response()->json(['data' => $result]);
    }

    public function enqueueLeadEscalation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lead_id' => 'required|integer|min:1',
            'source' => 'nullable|string|max:64',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->enqueueLeadEscalation(
            $request->user(),
            (int) $validated['lead_id'],
            (string) ($validated['source'] ?? 'copilot:escalation'),
            $locale
        );

        $status = ($result['ok'] ?? false) ? 200 : 403;

        return response()->json(['data' => $result], $status);
    }

    public function scanLeadEscalation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => 'nullable|integer|min:1|max:25',
            'workflow' => 'nullable|string|in:sales,telesales',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->scanLeadEscalation(
            $request->user(),
            $locale,
            (int) ($validated['limit'] ?? 5),
            (string) ($validated['workflow'] ?? 'sales')
        );

        return response()->json(['data' => $result]);
    }

    public function enqueueLeadLostDetective(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lead_id' => 'required|integer|min:1',
            'source' => 'nullable|string|max:64',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->enqueueLeadLostDetective(
            $request->user(),
            (int) $validated['lead_id'],
            (string) ($validated['source'] ?? 'copilot:lost-detective'),
            $locale
        );

        $status = ($result['ok'] ?? false) ? 200 : 403;

        return response()->json(['data' => $result], $status);
    }

    public function scanLeadLostDetective(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => 'nullable|integer|min:1|max:25',
            'workflow' => 'nullable|string|in:sales,telesales',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);

        $result = $this->notifications->scanLeadLostDetective(
            $request->user(),
            $locale,
            (int) ($validated['limit'] ?? 5),
            (string) ($validated['workflow'] ?? 'sales')
        );

        return response()->json(['data' => $result]);
    }

    public function openNotification(Request $request, int $notification): JsonResponse
    {
        $validated = $request->validate([
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
        ]);

        $locale = $this->resolveLocale($request, $validated['locale'] ?? null);
        $result = $this->notifications->open($request->user(), $notification, $locale);

        return response()->json(['data' => $result], ($result['ok'] ?? false) ? 200 : 404);
    }

    public function markNotificationRead(Request $request, int $notification): JsonResponse
    {
        $result = $this->notifications->markRead($request->user(), $notification);

        return response()->json(['data' => $result], ($result['ok'] ?? false) ? 200 : 404);
    }

    public function dismissNotification(Request $request, int $notification): JsonResponse
    {
        $result = $this->notifications->dismiss($request->user(), $notification);

        return response()->json(['data' => $result], ($result['ok'] ?? false) ? 200 : 404);
    }

    protected function resolveLocale(Request $request, ?string $override = null): string
    {
        $locale = strtolower((string) ($override ?? $request->input('locale', 'en')));

        return str_starts_with($locale, 'ar') ? 'ar' : 'en';
    }

    private function resolveQuickActions(User $user): array
    {
        $meta = is_array($user->meta_data ?? null) ? $user->meta_data : [];
        $modulePermissions = is_array($meta['module_permissions'] ?? null) ? $meta['module_permissions'] : [];
        $leadPerms = is_array($modulePermissions['Leads'] ?? null) ? $modulePermissions['Leads'] : [];
        $controlPerms = is_array($modulePermissions['Control'] ?? null) ? $modulePermissions['Control'] : [];

        $quickActions = [];
        $canShowAnyReport = !empty($this->catalog->forUser($user)['reports']);
        $canOpenPipeline = $this->catalog->canShowReport($user, 'Leads Pipeline');
        $canCreateLead = $this->userHasLeadCreatePermission($user, $leadPerms);
        $canAddAction = $this->userHasAddActionPermission($user, $leadPerms);
        $canViewLeads = $this->userCanViewLeads($user, $leadPerms, $controlPerms);

        if ($canViewLeads) {
            $quickActions[] = [
                'id' => 'delayed-leads',
                'label' => ['ar' => 'الليدز المتأخرة', 'en' => 'Delayed leads'],
                'message' => 'Show delayed leads',
                'displayText' => ['ar' => 'اعرض الليدز المتأخرة', 'en' => 'Show delayed leads'],
            ];
        }

        if ($canShowAnyReport) {
            $quickActions[] = [
                'id' => 'available-reports',
                'label' => ['ar' => 'إيه التقارير؟', 'en' => 'Available reports'],
                'message' => 'What reports can I open?',
                'displayText' => ['ar' => 'إيه التقارير المتاحة؟', 'en' => 'What reports can I open?'],
            ];
        }

        if ($canOpenPipeline) {
            $quickActions[] = [
                'id' => 'pipeline-report',
                'label' => ['ar' => 'افتح Pipeline', 'en' => 'Open pipeline'],
                'message' => 'Open leads pipeline report for this month',
                'displayText' => ['ar' => 'افتح تقرير Pipeline الشهر ده', 'en' => 'Open leads pipeline report for this month'],
            ];
        }

        if ($canCreateLead) {
            $quickActions[] = [
                'id' => 'new-lead',
                'label' => ['ar' => 'Lead جديد', 'en' => 'New lead'],
                'message' => 'Create a new lead',
                'displayText' => ['ar' => 'اعمل lead جديد', 'en' => 'Create a new lead'],
            ];
        }

        if ($canAddAction) {
            $quickActions[] = [
                'id' => 'follow-up-action',
                'label' => ['ar' => 'أكشن متابعة', 'en' => 'Follow-up action'],
                'message' => 'Create a follow-up action',
                'displayText' => ['ar' => 'اعمل أكشن متابعة', 'en' => 'Create a follow-up action'],
            ];
        }

        $quickActions[] = [
            'id' => 'explain-system',
            'label' => ['ar' => 'اشرح السيستم', 'en' => 'Explain system'],
            'message' => 'Explain the system',
            'displayText' => ['ar' => 'اشرح لي السيستم', 'en' => 'Explain the system'],
        ];

        $quickActions[] = [
            'id' => 'help',
            'label' => ['ar' => 'إيه أقدر أعمل؟', 'en' => 'What can I do?'],
            'message' => 'What can you help me with?',
            'displayText' => ['ar' => 'إيه اللي أقدر أعمله؟', 'en' => 'What can I do?'],
        ];

        return $quickActions;
    }

    private function userHasLeadCreatePermission(User $user, array $leadPerms): bool
    {
        if ($user->is_super_admin || $user->can('addLead') || $user->can('createLead') || $user->can('create-lead')) {
            return true;
        }

        return in_array('addLead', $leadPerms, true) || in_array('createLead', $leadPerms, true);
    }

    private function userHasAddActionPermission(User $user, array $leadPerms): bool
    {
        if ($user->is_super_admin || $user->can('addAction')) {
            return true;
        }

        return in_array('addAction', $leadPerms, true);
    }

    private function userCanViewLeads(User $user, array $leadPerms, array $controlPerms): bool
    {
        if ($user->is_super_admin || $user->can('view-all-leads')) {
            return true;
        }

        if (! empty($leadPerms)) {
            return true;
        }

        return in_array('showReports', $controlPerms, true);
    }
}


