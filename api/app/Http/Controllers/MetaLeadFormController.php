<?php

namespace App\Http\Controllers;

use App\Contracts\MetaApiClientInterface;
use App\Models\Integration;
use App\Models\MetaPage;
use App\Services\MetaFieldMappingSuggester;
use App\Services\MetaSystemSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Support\AppliesMetaAgencyScope;

class MetaLeadFormController extends Controller
{
    use AppliesMetaAgencyScope;

    public function __construct(
        protected MetaApiClientInterface $apiClient,
        protected MetaFieldMappingSuggester $mappingSuggester
    ) {
    }

    /**
     * List lead forms for active Meta pages in the current tenant.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $tenantId = $user?->tenant_id;

        if (!$tenantId) {
            return response()->json(['message' => 'Tenant context not found.'], 403);
        }

        $pages = MetaPage::where('tenant_id', $tenantId)
            ->where('is_active', true);
        $this->applyMetaAgencyFilter($pages, $this->resolveMetaAgencyFilter($request, $user));
        $pages = $pages
            ->get(['id', 'page_id', 'page_name', 'page_token']);

        $forms = [];
        $errors = [];

        foreach ($pages as $page) {
            $token = $page->page_token;
            if (!$token) {
                $errors[] = "Page {$page->page_name} has no page token.";
                continue;
            }

            try {
                $resp = $this->apiClient->get("/{$page->page_id}/leadgen_forms", [
                    'access_token' => $token,
                    'fields' => 'id,name,status,created_time',
                    'limit' => 200,
                ]);

                foreach (($resp['data'] ?? []) as $f) {
                    $forms[] = array_merge($f, [
                        'page_id' => $page->page_id,
                        'page_name' => $page->page_name,
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('Meta lead forms fetch failed', [
                    'tenant_id' => $tenantId,
                    'page_id' => $page->page_id,
                    'error' => $e->getMessage(),
                ]);
                $errors[] = "Failed to fetch forms for page {$page->page_name}.";
            }
        }

        return response()->json([
            'forms' => $forms,
            'errors' => $errors,
        ]);
    }

    /**
     * Save a mapping/config for a specific lead form id.
     * Stored under Integration(settings.formMap[form_id]).
     */
    public function map(Request $request)
    {
        $request->validate([
            'form_id' => 'required|string',
            'mapping' => 'required|array',
        ]);

        $user = $request->user();
        $tenantId = $user?->tenant_id;
        if (!$tenantId) {
            return response()->json(['message' => 'Tenant context not found.'], 403);
        }

        $integration = Integration::updateOrCreate(
            ['tenant_id' => $tenantId, 'provider' => 'meta'],
            ['status' => 'active']
        );

        $settings = is_array($integration->settings) ? $integration->settings : [];
        $settings['formMap'] = is_array($settings['formMap'] ?? null) ? $settings['formMap'] : [];
        $settings['formMap'][$request->input('form_id')] = $request->input('mapping');

        $integration->settings = $settings;
        $integration->save();

        return response()->json(['message' => 'Form mapping saved', 'settings' => $integration->settings]);
    }

    /**
     * Fetch a lead form's questions and return a suggested CRM field mapping.
     */
    public function suggestMapping(Request $request, string $formId)
    {
        $user = $request->user();
        $tenantId = $user?->tenant_id;
        if (! $tenantId) {
            return response()->json(['message' => 'Tenant context not found.'], 403);
        }

        $pages = MetaPage::where('tenant_id', $tenantId)
            ->where('is_active', true);
        $this->applyMetaAgencyFilter($pages, $this->resolveMetaAgencyFilter($request, $user));
        $pages = $pages->whereNotNull('page_token')->get();

        if ($pages->isEmpty()) {
            return response()->json(['message' => 'No active Meta page with a valid token was found.'], 422);
        }

        $resp = null;
        $lastError = null;

        foreach ($pages as $page) {
            try {
                $resp = $this->apiClient->get("/{$formId}", [
                    'access_token' => $page->page_token,
                    'fields' => 'id,name,questions',
                ]);
                break;
            } catch (\Throwable $e) {
                $lastError = $e->getMessage();
            }
        }

        if (! is_array($resp)) {
            Log::warning('Meta form questions fetch failed', [
                'tenant_id' => $tenantId,
                'form_id' => $formId,
                'error' => $lastError,
            ]);

            return response()->json(['message' => 'Failed to fetch form questions from Meta.'], 422);
        }

        $questions = is_array($resp['questions'] ?? null) ? $resp['questions'] : [];
        $suggested = $this->mappingSuggester->suggestFromQuestions($questions);

        return response()->json([
            'form_id' => $formId,
            'form_name' => $resp['name'] ?? null,
            'questions' => $questions,
            'suggested_mapping' => $suggested,
        ]);
    }
}
