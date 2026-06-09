<?php

namespace App\Http\Controllers;

use App\Models\WebsiteHomepageSection;
use App\Models\WebsiteService;
use App\Models\WebsiteSetting;
use App\Services\OwnerWebsiteTenantResolver;
use App\Services\WebsiteAnalyticsService;
use App\Services\WebsiteCmsBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SystemCompanyWebsiteController extends Controller
{
    public function __construct(
        private readonly OwnerWebsiteTenantResolver $ownerTenantResolver,
        private readonly WebsiteCmsBootstrapService $bootstrapService,
        private readonly WebsiteAnalyticsService $analyticsService,
    ) {
    }

    public function showSettings(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $settings = WebsiteSetting::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->firstOrFail();

        return response()->json($settings);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $request->validate([
            'company_name' => ['nullable', 'string', 'max:255'],
            'logo_url' => ['nullable', 'string', 'max:2048'],
            'favicon_url' => ['nullable', 'string', 'max:2048'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'social_links' => ['nullable', 'array'],
            'primary_color' => ['nullable', 'string', 'max:20'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string', 'max:2000'],
            'is_published' => ['nullable', 'boolean'],
        ]);

        $settings = WebsiteSetting::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->firstOrFail();

        $settings->update($validated);

        return response()->json($settings->fresh());
    }

    public function indexSections(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $sections = WebsiteHomepageSection::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($sections);
    }

    public function updateSection(Request $request, int $websiteHomepageSection): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $section = WebsiteHomepageSection::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($websiteHomepageSection);

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'array'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $section->update($validated);

        return response()->json($section->fresh());
    }

    public function reorderSections(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $request->validate([
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        foreach ($validated['order'] as $index => $sectionId) {
            WebsiteHomepageSection::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $sectionId)
                ->update(['sort_order' => ($index + 1) * 10]);
        }

        return response()->json([
            'message' => 'Sections reordered successfully.',
        ]);
    }

    public function indexServices(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $services = WebsiteService::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($services);
    }

    public function storeService(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $this->validateServicePayload($request, $tenantId);
        if (empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueSlug($tenantId, $validated['name']);
        }
        $validated['tenant_id'] = $tenantId;

        $service = WebsiteService::withoutGlobalScopes()->create($validated);

        return response()->json($service, 201);
    }

    public function updateService(Request $request, int $websiteService): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $service = WebsiteService::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($websiteService);

        $validated = $this->validateServicePayload($request, $tenantId, $service->id);

        if (array_key_exists('name', $validated) && empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueSlug($tenantId, $validated['name'], $service->id);
        }

        $service->update($validated);

        return response()->json($service->fresh());
    }

    public function destroyService(Request $request, int $websiteService): \Illuminate\Http\Response
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        $service = WebsiteService::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($websiteService);

        $service->delete();

        return response()->noContent();
    }

    public function analyticsOverview(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        return response()->json(
            $this->analyticsService->overview($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    public function analyticsPages(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        return response()->json(
            $this->analyticsService->pages($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    public function analyticsForms(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        return response()->json(
            $this->analyticsService->forms($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    public function analyticsCampaigns(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        return response()->json(
            $this->analyticsService->campaigns($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    private function validateServicePayload(Request $request, int $tenantId, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name' => [$ignoreId ? 'sometimes' : 'required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('website_services', 'slug')
                    ->where(fn ($query) => $query->where('tenant_id', $tenantId))
                    ->ignore($ignoreId),
            ],
            'short_description' => ['nullable', 'string', 'max:1000'],
            'description' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:100'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'cta_text' => ['nullable', 'string', 'max:100'],
            'form_name' => ['nullable', 'string', 'max:100'],
            'meta_title' => ['nullable', 'string', 'max:255'],
            'meta_description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);
    }

    private function makeUniqueSlug(int $tenantId, string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'service';
        $slug = $base;
        $counter = 1;

        while (
            WebsiteService::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('slug', $slug)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = $base . '-' . $counter;
            $counter++;
        }

        return $slug;
    }
}
