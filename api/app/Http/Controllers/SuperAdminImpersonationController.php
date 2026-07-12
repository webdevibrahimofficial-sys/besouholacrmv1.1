<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Services\AdminImpersonationService;
use App\Traits\LogsSuperAdminActivity;
use Illuminate\Http\Request;

class SuperAdminImpersonationController extends Controller
{
    use LogsSuperAdminActivity;

    public function __construct(
        private readonly AdminImpersonationService $impersonationService
    ) {
    }

    public function quickSwitchTenants(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $this->impersonationService->ensureActorCanImpersonate($request->user());

        return response()->json([
            'data' => $this->impersonationService->listEligibleTenants($request),
        ]);
    }

    public function start(Request $request, Tenant $tenant)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
            'mode' => 'nullable|string|in:support_access',
        ]);

        $user = $request->user();
        $result = $this->impersonationService->start($user, $tenant, $request, $validated);

        $this->logSuperAdminActivity(
            $user,
            'created',
            'super_admin_impersonation_started',
            $tenant,
            [
                'tenant_id' => $tenant->id,
                'session_id' => $result['session']['id'] ?? null,
                'reason' => $validated['reason'] ?? null,
                'mode' => $validated['mode'] ?? AdminImpersonationService::MODE_SUPPORT_ACCESS,
            ]
        );

        return response()->json($result);
    }

    public function current(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $user = $request->user();

        $session = $this->impersonationService->currentForAdmin($user);

        return response()->json([
            'active' => $session?->status === AdminImpersonationService::STATUS_ACTIVE,
            'session' => $session ? $this->impersonationService->serializeSession($session) : null,
        ]);
    }

    public function destroy(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $user = $request->user();

        $session = $this->impersonationService->currentForAdmin($user);
        if (!$session) {
            return response()->json([
                'message' => 'No active support access session.',
                'redirect_url' => '/system/tenants',
            ]);
        }

        $session = $this->impersonationService->end($session, $user, 'super_admin_exit');

        $this->logSuperAdminActivity(
            $user,
            'updated',
            'super_admin_impersonation_ended',
            $session->tenant,
            [
                'tenant_id' => $session->tenant_id,
                'session_id' => $session->id,
                'reason' => 'super_admin_exit',
            ]
        );

        return response()->json([
            'message' => 'Support access session ended.',
            'redirect_url' => '/system/tenants',
        ]);
    }

    protected function ensureSecureQuickSwitchEnabled(): void
    {
        abort_unless(config('features.secure_quick_switch'), 404);
    }
}
