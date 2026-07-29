<?php

namespace App\Http\Controllers;

use App\Models\WebsiteHomepageSection;
use App\Services\WebsiteCmsBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebsiteHomepageSectionController extends Controller
{
    public function __construct(private readonly WebsiteCmsBootstrapService $bootstrapService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $sections = WebsiteHomepageSection::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($sections);
    }

    public function update(Request $request, int $websiteHomepageSection): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $section = WebsiteHomepageSection::query()->findOrFail($websiteHomepageSection);

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'array'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $section->update($validated);

        return response()->json($section->fresh());
    }

    public function reorder(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $this->bootstrapService->ensureForTenant($tenantId);

        $validated = $request->validate([
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        foreach ($validated['order'] as $index => $sectionId) {
            WebsiteHomepageSection::query()
                ->where('id', $sectionId)
                ->update(['sort_order' => ($index + 1) * 10]);
        }

        return response()->json([
            'message' => 'Sections reordered successfully.',
        ]);
    }
}
