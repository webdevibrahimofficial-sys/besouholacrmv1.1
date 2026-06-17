<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\Tenant;
use App\Models\WebsiteCareerPage;
use App\Models\WebsiteCareerRole;
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
                'content' => $this->normalizeWebsiteAssetUrls($section->content ?? []),
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
            ->map(fn ($service) => [
                ...$service->toArray(),
                'image_url' => $this->normalizeWebsiteAssetUrl($service->image_url),
            ])
            ->values();

        $items = Item::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('name')
            ->where('name', '!=', '')
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'code',
            ])
            ->values();

        $careerPage = WebsiteCareerPage::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->first();

        $careerRoles = WebsiteCareerRole::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get([
                'id',
                'slug',
                'title',
                'department',
                'location',
                'work_type',
                'employment_type',
                'experience_level',
                'summary',
                'description',
                'responsibilities',
                'requirements',
                'benefits',
                'is_featured',
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
                'logo_url' => $this->normalizeWebsiteAssetUrl($settings->logo_url),
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
            'items' => $items,
            'careers' => [
                'page' => $careerPage ? [
                    'content' => $careerPage->content ?? [],
                ] : null,
                'roles' => $careerRoles,
            ],
        ]);
    }

    private function normalizeWebsiteAssetUrls(mixed $value): mixed
    {
        if (is_array($value)) {
            foreach ($value as $key => $item) {
                $value[$key] = $this->normalizeWebsiteAssetUrls($item);
            }

            return $value;
        }

        if (!is_string($value) || trim($value) === '') {
            return $value;
        }

        return $this->normalizeWebsiteAssetUrl($value);
    }

    private function normalizeWebsiteAssetUrl(?string $url): ?string
    {
        $value = trim((string) $url);
        if ($value === '') {
            return null;
        }

        $tenantPath = $this->extractWebsiteTenantPath($value);
        if ($tenantPath === null) {
            return $value;
        }

        return url('/api/public-website-assets/' . ltrim($tenantPath, '/'));
    }

    private function extractWebsiteTenantPath(string $url): ?string
    {
        $parsedPath = parse_url($url, PHP_URL_PATH);
        if (!is_string($parsedPath) || $parsedPath === '') {
            return null;
        }

        $normalizedPath = ltrim($parsedPath, '/');

        if (preg_match('/^\d+\/website(?:\/|$)/', $normalizedPath)) {
            return $normalizedPath;
        }

        if (preg_match('#(?:api/)?files/(?P<tenantPath>\d+/website(?:/[^?#]+)?)$#', $normalizedPath, $matches)) {
            return $matches['tenantPath'];
        }

        return null;
    }
}
