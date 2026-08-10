<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\CrmSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CrmSettingsController extends Controller
{
    public function show(Request $request)
    {
        try {
            if (Schema::hasTable('crm_settings')) {
                // Persist defaults for brand-new tenants so runtime matches the UI toggle.
                $record = CrmSetting::ensureInitialized(
                    $request->user()?->tenant_id ? (int) $request->user()->tenant_id : null
                );

                return response()->json(['settings' => CrmSetting::resolved($record)]);
            }
        } catch (\Throwable $e) {
        }

        return response()->json(['settings' => CrmSetting::defaults()]);
    }

    public function update(Request $request)
    {
        $payload = $request->input('settings', $request->all());
        if (! is_array($payload)) {
            return response()->json(['message' => 'Invalid settings payload'], 422);
        }
        if (! Schema::hasTable('crm_settings')) {
            $next = array_merge(CrmSetting::defaults(), $payload);

            return response()->json(['settings' => $next, 'message' => 'Settings storage not ready'], 200);
        }

        $tenantId = $request->user()?->tenant_id ? (int) $request->user()->tenant_id : null;
        $record = CrmSetting::ensureInitialized($tenantId);
        $next = array_merge(CrmSetting::defaults(), is_array($record->settings) ? $record->settings : [], $payload);
        $record->settings = $next;
        $record->save();

        // If global 2FA is disabled, force-disable it for all users in this tenant
        if (isset($next['enableTwoFactorAuth']) && $next['enableTwoFactorAuth'] === false) {
            DB::transaction(function () {
                $users = User::query()->get();
                foreach ($users as $user) {
                    $sec = is_array($user->security_settings) ? $user->security_settings : [];
                    $sec['two_factor_auth'] = false;
                    $user->security_settings = $sec;
                    $user->two_factor_code = null;
                    $user->two_factor_expires_at = null;
                    $user->saveQuietly();
                }
            });
        }

        return response()->json(['settings' => $record->settings]);
    }
}
