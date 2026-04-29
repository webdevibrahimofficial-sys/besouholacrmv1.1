<?php

namespace App\Http\Controllers;

use App\Models\LandingPage;
use App\Http\Resources\LandingPageResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Database\QueryException;

use App\Models\Lead;
use App\Models\Campaign;
use App\Models\Project;
use App\Models\Unit;
use App\Models\Item;
use App\Models\Tenant;

class LandingPageController extends Controller
{
    private function tenantSchema()
    {
        $connection = (new LandingPage())->getConnectionName() ?: config('database.default');
        return Schema::connection($connection);
    }

    private function tenantHasTable(string $table): bool
    {
        try {
            return $this->tenantSchema()->hasTable($table);
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function filterLandingPageColumns(array $data): array
    {
        $model = new LandingPage();

        try {
            $table = $model->getTable();
            $connection = $model->getConnectionName() ?: config('database.default');
            $columns = Schema::connection($connection)->getColumnListing($table);

            $allowed = array_flip($columns);
            return array_intersect_key($data, $allowed);
        } catch (\Throwable $e) {
            // Schema introspection might be blocked in some environments. Fall back to model fillable keys.
            try {
                $allowed = array_flip($model->getFillable() ?: []);
                return array_intersect_key($data, $allowed);
            } catch (\Throwable $inner) {
                return [];
            }
        }
    }

    private function extractUnknownColumnFromException(QueryException $e): ?string
    {
        $msg = (string) $e->getMessage();

        // MySQL: Unknown column 'meta_data' in 'field list'
        if (preg_match("/Unknown column '([^']+)'/i", $msg, $m)) {
            return (string) ($m[1] ?? '');
        }
        // PostgreSQL: column "meta_data" of relation "landing_pages" does not exist
        if (preg_match('/column \"([^\"]+)\" .* does not exist/i', $msg, $m)) {
            return (string) ($m[1] ?? '');
        }

        return null;
    }

    private function createLandingPageSafe(array $data): LandingPage
    {
        $filtered = $this->filterLandingPageColumns($data);
        $payload = !empty($filtered) ? $filtered : $data;

        $attempts = 0;
        while (true) {
            try {
                return LandingPage::create($payload);
            } catch (QueryException $e) {
                $attempts += 1;
                $col = $this->extractUnknownColumnFromException($e);
                if (!$col || $attempts > 12 || !array_key_exists($col, $payload)) {
                    throw $e;
                }
                unset($payload[$col]);
                Log::warning('Landing Page: dropped unknown column during create', ['column' => $col]);
            }
        }
    }

    private function updateLandingPageSafe(LandingPage $landingPage, array $data): void
    {
        $filtered = $this->filterLandingPageColumns($data);
        $payload = !empty($filtered) ? $filtered : $data;

        $attempts = 0;
        while (true) {
            try {
                $landingPage->update($payload);
                return;
            } catch (QueryException $e) {
                $attempts += 1;
                $col = $this->extractUnknownColumnFromException($e);
                if (!$col || $attempts > 12 || !array_key_exists($col, $payload)) {
                    throw $e;
                }
                unset($payload[$col]);
                Log::warning('Landing Page: dropped unknown column during update', ['column' => $col, 'landing_page_id' => $landingPage->id]);
            }
        }
    }

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $landingPages = LandingPage::with('campaign')->latest()->get();
        return LandingPageResource::collection($landingPages);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        try {
            $hasProjects = $this->tenantHasTable('projects');
            $hasUnits = $this->tenantHasTable('units');
            $hasItems = $this->tenantHasTable('items');

            $validator = Validator::make($request->all(), [
                'title' => 'required|string|max:255',
                'campaign_id' => 'nullable|exists:campaigns,id',
                'lead_project_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_unit_id,lead_item_id',
                    $hasProjects ? Rule::exists('projects', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasProjects) {
                        if (!empty($value) && !$hasProjects) {
                            $fail('Projects are not available for this tenant.');
                        }
                    },
                ])),
                'lead_unit_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_project_id,lead_item_id',
                    $hasUnits ? Rule::exists('units', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasUnits) {
                        if (!empty($value) && !$hasUnits) {
                            $fail('Units are not available for this tenant.');
                        }
                    },
                ])),
                'lead_item_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_project_id,lead_unit_id',
                    $hasItems ? Rule::exists('items', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasItems) {
                        if (!empty($value) && !$hasItems) {
                            $fail('Items are not available for this tenant.');
                        }
                    },
                ])),
                'source' => 'nullable|string',
                'email' => 'nullable|email',
                'phone' => 'nullable|string',
                'theme' => 'nullable|string',
                'description' => 'nullable|string',
                'header_script' => 'nullable|string',
                'header_script_enabled' => 'nullable|boolean',
                'body_script' => 'nullable|string',
                'body_script_enabled' => 'nullable|boolean',
                'pixel_id' => 'nullable|string',
                'is_pixel_enabled' => 'nullable|boolean',
                'gtm_id' => 'nullable|string',
                'is_gtm_enabled' => 'nullable|boolean',
                'facebook' => 'nullable|url',
                'instagram' => 'nullable|url',
                'twitter' => 'nullable|url',
                'linkedin' => 'nullable|url',
                'logo' => 'nullable|image|max:2048',
                'cover' => 'nullable|image|max:2048',
                'media.*' => 'nullable|file|max:10240',
            ]);

            if ($validator->fails()) {
                Log::warning('Landing Page Validation Error', $validator->errors()->toArray());
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $data = $request->except(['logo', 'cover', 'media']);

            // Tenant context is mandatory for storing landing pages.
            // BelongsToTenant auto-fills tenant_id for regular users, but super-admin requests may not
            // have tenant context unless ResolveTenant binds it (e.g. via X-Tenant-Id).
            $tenantId = app()->bound('current_tenant_id')
                ? app('current_tenant_id')
                : (Auth::check() ? Auth::user()?->tenant_id : null);
            if (!$tenantId) {
                $tenantSlug = $request->header('X-Tenant') ?: ($request->header('X-Tenant-Id') ?: $request->header('x-tenant-id'));
                if ($tenantSlug) {
                    $tenantId = Tenant::where('slug', (string) $tenantSlug)->value('id');
                }
            }
            if (!$tenantId) {
                throw ValidationException::withMessages([
                    'tenant_id' => ['Tenant context is required to create landing pages.'],
                ]);
            }
            $data['tenant_id'] = (int) $tenantId;

            // Generate Slug
            $data['slug'] = Str::slug($request->title) . '-' . Str::random(6);

            // Created By
            if ($request->user()) {
                $data['created_by'] = $request->user()->name;
            }

            if ($request->hasFile('logo')) {
                $path = $request->file('logo')->store('landing-pages/logos', 'public');
                $data['logo'] = '/storage/' . $path;
            }

            if ($request->hasFile('cover')) {
                $path = $request->file('cover')->store('landing-pages/covers', 'public');
                $data['cover'] = '/storage/' . $path;
            }

            // Handle Media Array
            $metaData = [];
            if ($request->hasFile('media')) {
                $mediaPaths = [];
                foreach ($request->file('media') as $file) {
                    $path = $file->store('landing-pages/media', 'public');
                    $mediaPaths[] = [
                        'path' => '/storage/' . $path,
                        'name' => $file->getClientOriginalName(),
                        'size' => $file->getSize(),
                        'mime' => $file->getMimeType(),
                    ];
                }
                $metaData['media'] = $mediaPaths;
            }

            // Lead context (Project / Unit / Item) stored in meta_data
            if ($hasProjects && $request->filled('lead_project_id')) {
                $project = Project::find($request->input('lead_project_id'));
                if ($project) {
                    $metaData['lead_project_id'] = $project->id;
                    $metaData['lead_project_name'] = $project->name;
                }
            }
            if ($hasUnits && $request->filled('lead_unit_id')) {
                $unit = Unit::find($request->input('lead_unit_id'));
                if ($unit) {
                    $metaData['lead_unit_id'] = $unit->id;
                    $metaData['lead_unit_name'] = $unit->name;
                }
            }
            if ($hasItems && $request->filled('lead_item_id')) {
                $item = Item::find($request->input('lead_item_id'));
                if ($item) {
                    $metaData['lead_item_id'] = $item->id;
                    $metaData['lead_item_name'] = $item->name;
                }
            }
            $data['meta_data'] = $metaData;

            $landingPage = $this->createLandingPageSafe($data);

            return new LandingPageResource($landingPage);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Throwable $e) {
            $errorId = (string) Str::uuid();

            Log::error('Landing Page Store Failed', [
                'error_id' => $errorId,
                'message' => $e->getMessage(),
                'exception' => get_class($e),
                'tenant_id' => app()->bound('current_tenant_id') ? app('current_tenant_id') : null,
                'request' => $request->except(['logo', 'cover', 'media']),
            ]);

            return response()->json([
                'message' => 'Failed to save landing page.',
                'error_id' => $errorId,
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(LandingPage $landingPage)
    {
        return new LandingPageResource($landingPage);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, LandingPage $landingPage)
    {
        try {
            $hasProjects = $this->tenantHasTable('projects');
            $hasUnits = $this->tenantHasTable('units');
            $hasItems = $this->tenantHasTable('items');

            $validator = Validator::make($request->all(), [
                'title' => 'required|string|max:255',
                'campaign_id' => 'nullable|exists:campaigns,id',
                'lead_project_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_unit_id,lead_item_id',
                    $hasProjects ? Rule::exists('projects', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasProjects) {
                        if (!empty($value) && !$hasProjects) {
                            $fail('Projects are not available for this tenant.');
                        }
                    },
                ])),
                'lead_unit_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_project_id,lead_item_id',
                    $hasUnits ? Rule::exists('units', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasUnits) {
                        if (!empty($value) && !$hasUnits) {
                            $fail('Units are not available for this tenant.');
                        }
                    },
                ])),
                'lead_item_id' => array_values(array_filter([
                    'nullable',
                    'integer',
                    'prohibited_with:lead_project_id,lead_unit_id',
                    $hasItems ? Rule::exists('items', 'id') : null,
                    function ($attribute, $value, $fail) use ($hasItems) {
                        if (!empty($value) && !$hasItems) {
                            $fail('Items are not available for this tenant.');
                        }
                    },
                ])),
                'source' => 'nullable|string',
                'email' => 'nullable|email',
                'phone' => 'nullable|string',
                'theme' => 'nullable|string',
                'description' => 'nullable|string',
                'header_script' => 'nullable|string',
                'header_script_enabled' => 'nullable|boolean',
                'body_script' => 'nullable|string',
                'body_script_enabled' => 'nullable|boolean',
                'pixel_id' => 'nullable|string',
                'is_pixel_enabled' => 'nullable|boolean',
                'gtm_id' => 'nullable|string',
                'is_gtm_enabled' => 'nullable|boolean',
                'facebook' => 'nullable|url',
                'instagram' => 'nullable|url',
                'twitter' => 'nullable|url',
                'linkedin' => 'nullable|url',
                'logo' => 'nullable|image|max:2048',
                'cover' => 'nullable|image|max:2048',
                'media.*' => 'nullable|file|max:10240',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $data = $request->except(['logo', 'cover', 'media', 'slug']);

            if ($request->hasFile('logo')) {
                // Delete old logo
                if ($landingPage->logo && strpos($landingPage->logo, '/storage/') === 0) {
                    \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $landingPage->logo));
                }
                $path = $request->file('logo')->store('landing-pages/logos', 'public');
                $data['logo'] = '/storage/' . $path;
            }

            if ($request->hasFile('cover')) {
                // Delete old cover
                if ($landingPage->cover && strpos($landingPage->cover, '/storage/') === 0) {
                    \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $landingPage->cover));
                }
                $path = $request->file('cover')->store('landing-pages/covers', 'public');
                $data['cover'] = '/storage/' . $path;
            }

            // Handle Media Array
            $metaData = $landingPage->meta_data ?? [];

            // 1. Filter existing media (remove deleted ones)
            $oldMedia = $metaData['media'] ?? [];
            $retainedPaths = $request->input('existing_media', []);

            $keptMedia = [];
            foreach ($oldMedia as $mediaItem) {
                if (in_array($mediaItem['path'], $retainedPaths)) {
                    $keptMedia[] = $mediaItem;
                } else {
                    // Delete file from storage if not retained
                    if (isset($mediaItem['path']) && strpos($mediaItem['path'], '/storage/') === 0) {
                        \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $mediaItem['path']));
                    }
                }
            }

            // 2. Append new media
            if ($request->hasFile('media')) {
                foreach ($request->file('media') as $file) {
                    $path = $file->store('landing-pages/media', 'public');
                    $keptMedia[] = [
                        'path' => '/storage/' . $path,
                        'name' => $file->getClientOriginalName(),
                        'size' => $file->getSize(),
                        'mime' => $file->getMimeType(),
                    ];
                }
            }

            $metaData['media'] = $keptMedia;

            // Update / clear lead context (Project / Unit / Item)
            if ($request->has('lead_project_id')) {
                if ($request->filled('lead_project_id')) {
                    if ($hasProjects && ($project = Project::find($request->input('lead_project_id')))) {
                        $metaData['lead_project_id'] = $project->id;
                        $metaData['lead_project_name'] = $project->name;
                        unset($metaData['lead_unit_id'], $metaData['lead_unit_name']);
                        unset($metaData['lead_item_id'], $metaData['lead_item_name']);
                    }
                } else {
                    unset($metaData['lead_project_id'], $metaData['lead_project_name']);
                }
            }

            if ($request->has('lead_unit_id')) {
                if ($request->filled('lead_unit_id')) {
                    if ($hasUnits && ($unit = Unit::find($request->input('lead_unit_id')))) {
                        $metaData['lead_unit_id'] = $unit->id;
                        $metaData['lead_unit_name'] = $unit->name;
                        unset($metaData['lead_project_id'], $metaData['lead_project_name']);
                        unset($metaData['lead_item_id'], $metaData['lead_item_name']);
                    }
                } else {
                    unset($metaData['lead_unit_id'], $metaData['lead_unit_name']);
                }
            }

            if ($request->has('lead_item_id')) {
                if ($request->filled('lead_item_id')) {
                    if ($hasItems && ($item = Item::find($request->input('lead_item_id')))) {
                        $metaData['lead_item_id'] = $item->id;
                        $metaData['lead_item_name'] = $item->name;
                        unset($metaData['lead_project_id'], $metaData['lead_project_name']);
                        unset($metaData['lead_unit_id'], $metaData['lead_unit_name']);
                    }
                } else {
                    unset($metaData['lead_item_id'], $metaData['lead_item_name']);
                }
            }

            $data['meta_data'] = $metaData;

            $this->updateLandingPageSafe($landingPage, $data);

            return new LandingPageResource($landingPage);
        } catch (\Throwable $e) {
            $errorId = (string) Str::uuid();

            Log::error('Landing Page Update Failed', [
                'error_id' => $errorId,
                'landing_page_id' => $landingPage->id,
                'message' => $e->getMessage(),
                'exception' => get_class($e),
                'tenant_id' => app()->bound('current_tenant_id') ? app('current_tenant_id') : null,
                'request' => $request->except(['logo', 'cover', 'media']),
            ]);

            return response()->json([
                'message' => 'Failed to save landing page.',
                'error_id' => $errorId,
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(LandingPage $landingPage)
    {
        // Delete Logo
        if ($landingPage->logo && strpos($landingPage->logo, '/storage/') === 0) {
             \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $landingPage->logo));
        }

        // Delete Cover
        if ($landingPage->cover && strpos($landingPage->cover, '/storage/') === 0) {
             \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $landingPage->cover));
        }

        // Delete Media
        if (isset($landingPage->meta_data['media'])) {
            foreach ($landingPage->meta_data['media'] as $media) {
                 if (isset($media['path']) && strpos($media['path'], '/storage/') === 0) {
                      \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $media['path']));
                 }
            }
        }

        $landingPage->delete();
        return response()->json(null, 204);
    }

    /**
     * Display the specified resource for public view.
     */
    public function showPublic($slug)
    {
        $landingPage = LandingPage::withoutGlobalScope('tenant')
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();
        
        // Set tenant context
        app()->instance('current_tenant_id', $landingPage->tenant_id);

        // Increment visits
        $landingPage->increment('visits');
        
        return new LandingPageResource($landingPage);
    }

    /**
     * Store a lead from the landing page.
     */
    public function storeLead(Request $request, $slug)
    {
        $landingPage = LandingPage::withoutGlobalScope('tenant')
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        // Validate
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'required|string|max:255',
            'message' => 'nullable|string',
            'gclid' => 'nullable|string|max:255',
            'utm_source' => 'nullable|string|max:255',
            'utm_medium' => 'nullable|string|max:255',
            'utm_campaign' => 'nullable|string|max:255',
            'utm_term' => 'nullable|string|max:255',
            'utm_content' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Set Tenant Context for Lead creation to avoid scope issues
        app()->instance('current_tenant_id', $landingPage->tenant_id);

        $landingMeta = is_array($landingPage->meta_data) ? $landingPage->meta_data : [];

        $projectId = isset($landingMeta['lead_project_id']) ? (int) $landingMeta['lead_project_id'] : null;
        $projectName = $landingMeta['lead_project_name'] ?? null;
        if ($projectId && !$projectName) {
            $projectName = Project::whereKey($projectId)->value('name');
        }

        $unitId = isset($landingMeta['lead_unit_id']) ? (int) $landingMeta['lead_unit_id'] : null;
        $unitName = $landingMeta['lead_unit_name'] ?? null;
        if ($unitId && !$unitName) {
            $unitName = Unit::whereKey($unitId)->value('name');
        }

        $lead = Lead::create([
            'tenant_id' => $landingPage->tenant_id,
            'campaign_id' => $landingPage->campaign_id,
            'source' => $landingPage->source ?? 'Landing Page',
            'stage' => 'new',
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'project_id' => $projectId ?: null,
            'project' => $projectName ?: null,
            'unit_id' => $unitId ?: null,
            'unit' => $unitName ?: null,
            'gcl_id' => $request->gclid,
            'notes' => $request->message,
            'meta_data' => [
                'landing_page_id' => $landingPage->id,
                'landing_page_title' => $landingPage->title,
                'landing_page_slug' => $landingPage->slug,
                'landing_page_context' => [
                    'project_id' => $projectId ?: null,
                    'project' => $projectName ?: null,
                    'unit_id' => $unitId ?: null,
                    'unit' => $unitName ?: null,
                ],
                'utm' => [
                    'source' => $request->utm_source,
                    'medium' => $request->utm_medium,
                    'campaign' => $request->utm_campaign,
                    'term' => $request->utm_term,
                    'content' => $request->utm_content,
                ],
            ]
        ]);

        $landingPage->increment('conversions');
        
        if ($landingPage->campaign_id) {
            $campaign = Campaign::find($landingPage->campaign_id);
            if ($campaign) {
                $campaign->increment('leads');
                $meta = $campaign->meta_data ?? [];
                $model = $meta['billing_model'] ?? null;
                if ($model === 'cpl') {
                    $cost = $meta['cpl_cost'] ?? null;
                    if (is_numeric($cost)) {
                        $campaign->increment('spend', $cost);
                    }
                }
            }
        }

        return response()->json(['message' => 'Lead submitted successfully', 'lead_id' => $lead->id], 201);
    }
}
