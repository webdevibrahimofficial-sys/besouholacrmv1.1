<?php

namespace App\Http\Controllers;

use App\Models\WebsiteSetting;
use App\Services\WebsiteCmsBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class WebsiteCmsSettingController extends Controller
{
    private const HEX_COLOR_RULE = 'regex:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/';

    public function __construct(private readonly WebsiteCmsBootstrapService $bootstrapService)
    {
    }

    public function show(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $settings = WebsiteSetting::query()->firstOrFail();

        return response()->json($settings);
    }

    public function update(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $rules = [
            'company_name' => ['nullable', 'string', 'max:255'],
            'logo_url' => ['nullable', 'string', 'max:2048'],
            'favicon_url' => ['nullable', 'string', 'max:2048'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'social_links' => ['nullable', 'array'],
            'primary_color' => ['nullable', 'string', 'max:20', self::HEX_COLOR_RULE],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string', 'max:2000'],
            'is_published' => ['nullable', 'boolean'],
        ];

        if (Schema::hasColumn('website_settings', 'secondary_color')) {
            $rules['secondary_color'] = ['nullable', 'string', 'max:20', self::HEX_COLOR_RULE];
        }

        $validated = $request->validate($rules);

        $settings = WebsiteSetting::query()->firstOrFail();
        $settings->update($validated);

        return response()->json($settings->fresh());
    }
}
