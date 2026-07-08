<?php

namespace App\Http\Controllers;

use App\Services\AdminImpersonationService;
use Illuminate\Http\Request;

class ImpersonationController extends Controller
{
    public function __construct(
        private readonly AdminImpersonationService $impersonationService
    ) {
    }

    public function exchange(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $validated = $request->validate([
            'token' => 'required|string|min:32',
        ]);

        return response()->json(
            $this->impersonationService->exchange($validated['token'], $request)
        );
    }

    public function current(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $session = app()->bound('impersonation_session') ? app('impersonation_session') : null;

        return response()->json([
            'active' => (bool) $session,
            'session' => $session ? $this->impersonationService->serializeSession($session) : null,
        ]);
    }

    public function destroy(Request $request)
    {
        $this->ensureSecureQuickSwitchEnabled();
        $session = app()->bound('impersonation_session') ? app('impersonation_session') : null;
        $centralRedirectUrl = rtrim((string) config('app.frontend_url', ''), '/') . '/#/system/tenants';

        if (!$session) {
            return response()->json([
                'message' => 'No active support access session.',
                'redirect_url' => $centralRedirectUrl,
            ]);
        }

        $actor = $request->user();
        $panelToken = $actor->createToken('admin_panel');
        $plainToken = $panelToken->plainTextToken;

        $session = $this->impersonationService->end($session, $actor, 'tenant_workspace_exit');

        activity('super_admin')
            ->causedBy($actor)
            ->performedOn($session->tenant)
            ->withProperties([
                'tenant_id' => $session->tenant_id,
                'session_id' => $session->id,
                'reason' => 'tenant_workspace_exit',
            ])
            ->event('updated')
            ->log('super_admin_impersonation_ended');

        return response()->json([
            'message' => 'Support access session ended.',
            'redirect_url' => $centralRedirectUrl,
            'token' => $plainToken,
        ]);
    }

    protected function ensureSecureQuickSwitchEnabled(): void
    {
        abort_unless(config('features.secure_quick_switch'), 404);
    }
}
