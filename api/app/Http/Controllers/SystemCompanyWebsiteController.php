<?php

namespace App\Http\Controllers;

use App\Models\WebsiteCareerPage;
use App\Models\WebsiteCareerRole;
use App\Models\WebsiteHomepageSection;
use App\Models\WebsiteJobApplication;
use App\Models\WebsiteService;
use App\Models\WebsiteSetting;
use App\Services\OwnerWebsiteTenantResolver;
use App\Services\WebsiteAnalyticsService;
use App\Services\WebsiteCmsBootstrapService;
use App\Services\TenantStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class SystemCompanyWebsiteController extends Controller
{
    private const HEX_COLOR_RULE = 'regex:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/';

    public function __construct(
        private readonly OwnerWebsiteTenantResolver $ownerTenantResolver,
        private readonly WebsiteCmsBootstrapService $bootstrapService,
        private readonly WebsiteAnalyticsService $analyticsService,
        private readonly TenantStorageService $tenantStorageService,
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

        foreach ([
            'social_links',
            'contact_page_content',
            'nav_links',
            'footer_sections',
            'footer_quick_links',
            'whatsapp_float',
            'pages_seo',
        ] as $field) {
            $payload = $request->input($field);
            if (is_string($payload)) {
                $decoded = json_decode($payload, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $request->merge([$field => $decoded]);
                }
            }
        }

        $rules = [
            'company_name' => ['nullable', 'string', 'max:255'],
            'logo_url' => ['nullable', 'string', 'max:2048'],
            'logo' => ['nullable', 'image', 'max:5120'],
            'favicon_url' => ['nullable', 'string', 'max:2048'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'website_url' => ['nullable', 'string', 'max:2048'],
            'social_links' => ['nullable', 'array'],
            'contact_page_content' => ['nullable', 'array'],
            'nav_links' => ['nullable', 'array'],
            'nav_cta_text' => ['nullable', 'string', 'max:100'],
            'nav_cta_href' => ['nullable', 'string', 'max:2048'],
            'footer_sections' => ['nullable', 'array'],
            'footer_quick_links' => ['nullable', 'array'],
            'footer_tagline' => ['nullable', 'string', 'max:255'],
            'footer_description' => ['nullable', 'string', 'max:4000'],
            'whatsapp_float' => ['nullable', 'array'],
            'pages_seo' => ['nullable', 'array'],
            'primary_color' => ['nullable', 'string', 'max:20', self::HEX_COLOR_RULE],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string', 'max:2000'],
            'is_published' => ['nullable', 'boolean'],
        ];

        if (Schema::hasColumn('website_settings', 'secondary_color')) {
            $rules['secondary_color'] = ['nullable', 'string', 'max:20', self::HEX_COLOR_RULE];
        }

        $validated = $request->validate($rules);

        $settings = WebsiteSetting::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->firstOrFail();

        if ($request->hasFile('logo')) {
            $upload = $this->tenantStorageService->upload($request->file('logo'), 'website/branding');
            $validated['logo_url'] = $this->publicWebsiteAssetUrl($upload['path']);
        }

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

        $contentPayload = $request->input('content');
        if (is_string($contentPayload)) {
            $decoded = json_decode($contentPayload, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $request->merge(['content' => $decoded]);
            }
        }

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'array'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
            'primary_image' => ['nullable', 'image', 'max:5120'],
            'secondary_image' => ['nullable', 'image', 'max:5120'],
            'portfolio_card_1_image' => ['nullable', 'image', 'max:5120'],
            'portfolio_card_2_image' => ['nullable', 'image', 'max:5120'],
            'portfolio_card_3_image' => ['nullable', 'image', 'max:5120'],
            'testimonial_1_avatar' => ['nullable', 'image', 'max:5120'],
            'testimonial_2_avatar' => ['nullable', 'image', 'max:5120'],
            'testimonial_3_avatar' => ['nullable', 'image', 'max:5120'],
            'testimonial_4_avatar' => ['nullable', 'image', 'max:5120'],
            'testimonial_5_avatar' => ['nullable', 'image', 'max:5120'],
            'testimonial_6_avatar' => ['nullable', 'image', 'max:5120'],
            'app_slide_image' => ['nullable', 'image', 'max:10240'],
        ]);

        $content = is_array($validated['content'] ?? null)
            ? $validated['content']
            : (is_array($section->content) ? $section->content : []);

        if ($request->hasFile('primary_image')) {
            $upload = $this->tenantStorageService->upload(
                $request->file('primary_image'),
                'website/about'
            );
            $content['primary_image_url'] = $this->publicWebsiteAssetUrl($upload['path']);
        }

        if ($request->hasFile('secondary_image')) {
            $upload = $this->tenantStorageService->upload(
                $request->file('secondary_image'),
                'website/about'
            );
            $content['secondary_image_url'] = $this->publicWebsiteAssetUrl($upload['path']);
        }

        if ($section->type === 'portfolio') {
            $cards = is_array($content['cards'] ?? null) ? array_values($content['cards']) : [];

            foreach ([1, 2, 3] as $index) {
                $field = 'portfolio_card_' . $index . '_image';
                if ($request->hasFile($field) && isset($cards[$index - 1])) {
                    $upload = $this->tenantStorageService->upload(
                        $request->file($field),
                        'website/portfolio'
                    );
                    $cards[$index - 1]['image_url'] = $this->publicWebsiteAssetUrl($upload['path']);
                }
            }

            $content['cards'] = $cards;
        }

        if ($section->type === 'testimonials') {
            $testimonials = is_array($content['testimonials'] ?? null) ? array_values($content['testimonials']) : [];

            foreach ([1, 2, 3, 4, 5, 6] as $index) {
                $field = 'testimonial_' . $index . '_avatar';
                if ($request->hasFile($field) && isset($testimonials[$index - 1])) {
                    $upload = $this->tenantStorageService->upload(
                        $request->file($field),
                        'website/testimonials'
                    );
                    $testimonials[$index - 1]['avatar'] = $this->publicWebsiteAssetUrl($upload['path']);
                }
            }

            $content['testimonials'] = $testimonials;
        }

        if ($section->type === 'lead_leak_detector' && $request->hasFile('app_slide_image')) {
            $upload = $this->tenantStorageService->upload(
                $request->file('app_slide_image'),
                'website/lead-leak-detector'
            );
            $content['app_image_url'] = $this->publicWebsiteAssetUrl($upload['path']);
        }

        if (
            array_key_exists('content', $validated)
            || $request->hasFile('primary_image')
            || $request->hasFile('secondary_image')
            || $request->hasFile('portfolio_card_1_image')
            || $request->hasFile('portfolio_card_2_image')
            || $request->hasFile('portfolio_card_3_image')
            || $request->hasFile('testimonial_1_avatar')
            || $request->hasFile('testimonial_2_avatar')
            || $request->hasFile('testimonial_3_avatar')
            || $request->hasFile('testimonial_4_avatar')
            || $request->hasFile('testimonial_5_avatar')
            || $request->hasFile('testimonial_6_avatar')
            || $request->hasFile('app_slide_image')
        ) {
            $validated['content'] = $content;
        }

        $section->update($validated);

        return response()->json($section->fresh());
    }

    private function publicWebsiteAssetUrl(string $path): string
    {
        return url('/api/public-website-assets/' . ltrim($path, '/'));
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

    public function showCareerPage(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $page = WebsiteCareerPage::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->firstOrFail();

        return response()->json($page);
    }

    public function updateCareerPage(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $page = WebsiteCareerPage::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->firstOrFail();

        $validated = $request->validate([
            'content' => ['required', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $page->update($validated);

        return response()->json($page->fresh());
    }

    public function indexCareerRoles(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $roles = WebsiteCareerRole::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($roles);
    }

    public function storeCareerRole(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $this->validateCareerRolePayload($request, $tenantId);
        if (empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueCareerRoleSlug($tenantId, $validated['title']);
        }
        $validated['tenant_id'] = $tenantId;

        $role = WebsiteCareerRole::withoutGlobalScopes()->create($validated);

        return response()->json($role, 201);
    }

    public function updateCareerRole(Request $request, int $websiteCareerRole): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();
        $this->bootstrapService->ensureForTenant($tenantId);

        $role = WebsiteCareerRole::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($websiteCareerRole);

        $validated = $this->validateCareerRolePayload($request, $tenantId, $role->id);
        if (array_key_exists('title', $validated) && empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueCareerRoleSlug($tenantId, $validated['title'], $role->id);
        }

        $role->update($validated);

        return response()->json($role->fresh());
    }

    public function destroyCareerRole(Request $request, int $websiteCareerRole): \Illuminate\Http\Response
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        $role = WebsiteCareerRole::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($websiteCareerRole);

        $role->delete();

        return response()->noContent();
    }

    public function indexCareerApplications(Request $request): JsonResponse
    {
        $tenantId = $this->ownerTenantResolver->bindTenantContext();

        $applications = WebsiteJobApplication::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->latest()
            ->get()
            ->map(function (WebsiteJobApplication $application) {
                $meta = is_array($application->meta_data) ? $application->meta_data : [];

                return [
                    'id' => $application->id,
                    'status' => $application->status,
                    'source' => $application->source,
                    'role_slug' => $application->role_slug,
                    'role_title' => $application->role_title,
                    'full_name' => $application->full_name,
                    'email' => $application->email,
                    'phone' => $application->phone,
                    'current_role' => $application->current_role,
                    'years_experience' => $application->years_experience,
                    'location' => $application->location,
                    'work_preference' => $application->work_preference,
                    'linkedin_url' => $application->linkedin_url,
                    'portfolio_url' => $application->portfolio_url,
                    'salary_expectation' => $application->salary_expectation,
                    'availability' => $application->availability,
                    'motivation' => $application->motivation,
                    'biggest_achievement' => $application->biggest_achievement,
                    'cover_letter' => $application->cover_letter,
                    'answers' => $application->answers,
                    'meta_data' => $meta,
                    'origin' => $application->origin,
                    'created_at' => optional($application->created_at)?->toISOString(),
                    'cv_original_name' => $application->cv_original_name,
                    'cv_mime' => $application->cv_mime,
                    'cv_size' => $application->cv_size,
                    'cv_url' => $application->cv_path
                        ? $this->tenantStorageService->getUrl($application->cv_path)
                        : ($meta['cv_url'] ?? null),
                ];
            })
            ->values();

        return response()->json($applications);
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

    private function validateCareerRolePayload(Request $request, int $tenantId, ?int $ignoreId = null): array
    {
        return $request->validate([
            'title' => [$ignoreId ? 'sometimes' : 'required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('website_career_roles', 'slug')
                    ->where(fn ($query) => $query->where('tenant_id', $tenantId))
                    ->ignore($ignoreId),
            ],
            'department' => ['nullable', 'string', 'max:120'],
            'location' => ['nullable', 'string', 'max:160'],
            'work_type' => ['nullable', 'string', 'max:120'],
            'employment_type' => ['nullable', 'string', 'max:120'],
            'experience_level' => ['nullable', 'string', 'max:120'],
            'summary' => ['nullable', 'string', 'max:1200'],
            'description' => ['nullable', 'string'],
            'responsibilities' => ['nullable', 'array'],
            'responsibilities.*' => ['nullable', 'string'],
            'requirements' => ['nullable', 'array'],
            'requirements.*' => ['nullable', 'string'],
            'benefits' => ['nullable', 'array'],
            'benefits.*' => ['nullable', 'string'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_featured' => ['nullable', 'boolean'],
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

    private function makeUniqueCareerRoleSlug(int $tenantId, string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'career-role';
        $slug = $base;
        $counter = 1;

        while (
            WebsiteCareerRole::withoutGlobalScopes()
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
