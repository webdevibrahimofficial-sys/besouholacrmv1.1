<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\WebsiteHomepageSection;
use App\Models\WebsiteService;
use App\Models\WebsiteSetting;
use App\Services\WebsiteCmsBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicWebsiteContentController extends Controller
{
    public function __construct(private readonly WebsiteCmsBootstrapService $bootstrapService)
    {
    }

    public function show(Request $request, string $tenantSlug): JsonResponse
    {
        $tenant = Tenant::query()
            ->where('slug', $tenantSlug)
            ->where('status', 'active')
            ->first();

        if (!$tenant) {
            return response()->json(['message' => 'Website content not found.'], 404);
        }

        $tenantId = (int) $tenant->id;
        app()->instance('current_tenant_id', $tenantId);

        $this->bootstrapService->ensureForTenant($tenantId);

        $settings = WebsiteSetting::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->first();

        if (!$settings || !$settings->is_published) {
            return response()->json(['message' => 'Website is not published.'], 404);
        }

        $sections = WebsiteHomepageSection::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn ($section) => [
                'type' => $section->type,
                'title' => $section->title,
                'content' => $section->content ?? [],
            ])
            ->values();

        $services = WebsiteService::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get([
                'id',
                'name',
                'slug',
                'short_description',
                'description',
                'icon',
                'image_url',
                'cta_text',
                'form_name',
                'meta_title',
                'meta_description',
            ])
            ->values();

        return response()->json([
            'tenant' => [
                'id' => $tenant->id,
                'slug' => $tenant->slug,
                'name' => $tenant->name,
            ],
            'settings' => [
                'company_name' => $settings->company_name,
                'logo_url' => $settings->logo_url,
                'favicon_url' => $settings->favicon_url,
                'phone' => $settings->phone,
                'email' => $settings->email,
                'whatsapp' => $settings->whatsapp,
                'address' => $settings->address,
                'social_links' => $settings->social_links ?? [],
                'primary_color' => $settings->primary_color,
                'seo_title' => $settings->seo_title,
                'seo_description' => $settings->seo_description,
            ],
            'sections' => $sections,
            'services' => $services,
        ]);
    }
}
