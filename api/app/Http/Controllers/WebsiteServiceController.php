<?php

namespace App\Http\Controllers;

use App\Models\WebsiteService;
use App\Services\WebsiteCmsBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class WebsiteServiceController extends Controller
{
    public function __construct(private readonly WebsiteCmsBootstrapService $bootstrapService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $services = WebsiteService::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($services);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $this->validatePayload($request, $tenantId);
        if (empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueSlug($tenantId, $validated['name']);
        }

        $service = WebsiteService::query()->create($validated);

        return response()->json($service, 201);
    }

    public function update(Request $request, int $websiteService): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $service = WebsiteService::query()->findOrFail($websiteService);
        $validated = $this->validatePayload($request, $tenantId, $service->id);

        if (array_key_exists('name', $validated) && empty($validated['slug'])) {
            $validated['slug'] = $this->makeUniqueSlug($tenantId, $validated['name'], $service->id);
        }

        $service->update($validated);

        return response()->json($service->fresh());
    }

    public function destroy(Request $request, int $websiteService): \Illuminate\Http\Response
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $service = WebsiteService::query()->findOrFail($websiteService);
        $service->delete();

        return response()->noContent();
    }

    private function validatePayload(Request $request, int $tenantId, ?int $ignoreId = null): array
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
