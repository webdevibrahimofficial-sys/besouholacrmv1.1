<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    protected function authorizeSuperAdmin(Request $request): void
    {
        $user = $request->user();

        abort_unless($user && ($user->is_super_admin ?? false), 403, 'Super Admin access required.');
    }

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        // Return key-value pairs
        $settings = SystemSetting::all()->pluck('value', 'key');
        return response()->json($settings);
    }

    public function update(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'settings' => 'required|array',
            'settings.*' => 'nullable|string', // Values can be null or string
        ]);

        foreach ($validated['settings'] as $key => $value) {
            SystemSetting::updateOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        return response()->json(['message' => 'Settings updated successfully']);
    }
}
