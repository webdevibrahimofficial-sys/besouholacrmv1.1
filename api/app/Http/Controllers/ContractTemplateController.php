<?php

namespace App\Http\Controllers;

use App\Models\CcContract;
use App\Models\ContractTemplate;
use App\Services\ContractTemplateRenderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

class ContractTemplateController extends Controller
{
    protected function ensureContractTemplatesReady()
    {
        if (!Schema::hasTable('contract_templates')) {
            return response()->json([
                'message' => 'Contract templates are not initialized on the server (missing contract_templates table). Please run migrations.',
            ], 503);
        }

        return null;
    }

    protected function filterTemplateColumns(array $data): array
    {
        // Be backward-compatible with deployments that haven't run the latest migrations yet.
        // Only keep keys that actually exist as columns to avoid SQL errors.
        try {
            $columns = Schema::getColumnListing('contract_templates');
        } catch (\Throwable $e) {
            return $data;
        }
        $colSet = array_flip($columns);
        return array_intersect_key($data, $colSet);
    }

    public function index(Request $request)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $templates = ContractTemplate::with(['project:id,name'])
            ->where('tenant_id', $user->tenant_id)
            ->latest()
            ->get();

        return response()->json($templates);
    }

    public function show(Request $request, $id)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $tpl = ContractTemplate::with(['project:id,name'])
            ->where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        return response()->json($tpl);
    }

    public function store(Request $request)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'project_id' => [
                'nullable',
                'integer',
                Rule::exists('projects', 'id')->where(fn ($q) => $q->where('tenant_id', $user->tenant_id)),
            ],
            'content_type' => 'nullable|string|in:html,pdf',
            'body' => 'nullable|string',
            'pdf' => 'nullable|file|mimes:pdf|max:20480', // 20MB
            'status' => 'nullable|string|max:50',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = $validated['status'] ?? 'Active';
        $validated['content_type'] = $validated['content_type'] ?? ($request->hasFile('pdf') ? 'pdf' : 'html');

        if ($request->hasFile('pdf')) {
            $file = $request->file('pdf');
            $path = $file->storeAs(
                'contract-templates/' . $user->tenant_id,
                now()->format('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.pdf',
                'public'
            );
            $validated['pdf_path'] = $path;
            $validated['pdf_original_name'] = $file->getClientOriginalName();
            $validated['body'] = null;
            $validated['content_type'] = 'pdf';
        }

        $validated = $this->filterTemplateColumns($validated);
        if (($validated['content_type'] ?? null) === 'pdf' && !Schema::hasColumn('contract_templates', 'pdf_path')) {
            return response()->json([
                'message' => 'PDF templates are not supported on this server yet. Please run latest migrations/deploy.',
            ], 503);
        }

        $tpl = ContractTemplate::create($validated);
        $tpl->load(['project:id,name']);

        return response()->json($tpl, 201);
    }

    public function update(Request $request, $id)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $tpl = ContractTemplate::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'project_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('projects', 'id')->where(fn ($q) => $q->where('tenant_id', $user->tenant_id)),
            ],
            'content_type' => 'sometimes|nullable|string|in:html,pdf',
            'body' => 'sometimes|nullable|string',
            'pdf' => 'nullable|file|mimes:pdf|max:20480', // 20MB
            'pdf_path' => 'sometimes|nullable|string', // allow clearing when switching back to html
            'status' => 'nullable|string|max:50',
        ]);

        if ($request->hasFile('pdf')) {
            $file = $request->file('pdf');
            $path = $file->storeAs(
                'contract-templates/' . $user->tenant_id,
                now()->format('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.pdf',
                'public'
            );

            $old = $tpl->pdf_path;
            $validated['pdf_path'] = $path;
            $validated['pdf_original_name'] = $file->getClientOriginalName();
            $validated['body'] = null;
            $validated['content_type'] = 'pdf';

            if ($old) {
                try {
                    Storage::disk('public')->delete($old);
                } catch (\Throwable $e) {
                }
            }
        } else {
            // If caller explicitly switches to html, clear pdf_path.
            if (($validated['content_type'] ?? null) === 'html') {
                $validated['pdf_path'] = null;
                $validated['pdf_original_name'] = null;
            }
        }

        $validated = $this->filterTemplateColumns($validated);
        if (($validated['content_type'] ?? null) === 'pdf' && !Schema::hasColumn('contract_templates', 'pdf_path')) {
            return response()->json([
                'message' => 'PDF templates are not supported on this server yet. Please run latest migrations/deploy.',
            ], 503);
        }

        $tpl->update($validated);
        $tpl->load(['project:id,name']);

        return response()->json($tpl);
    }

    public function destroy(Request $request, $id)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $tpl = ContractTemplate::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $tpl->delete();

        return response()->json(null, 204);
    }

    /**
     * Backend preview for contract templates using the same render pipeline as printing.
     *
     * Returns a full HTML document (same view as print) to avoid mismatch between frontend/backend rendering.
     */
    public function preview(Request $request, ContractTemplateRenderService $renderer)
    {
        if ($resp = $this->ensureContractTemplatesReady()) {
            return $resp;
        }

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'template_id' => ['nullable', 'integer'],
            'project_id' => [
                'nullable',
                'integer',
                Rule::exists('projects', 'id')->where(fn ($q) => $q->where('tenant_id', $user->tenant_id)),
            ],
            'contract_id' => ['nullable', 'integer'],
            'body' => ['nullable', 'string'],
            'rtl' => ['nullable'],
        ]);

        $tenantId = (int) $user->tenant_id;

        $contract = null;
        if (!empty($validated['contract_id'])) {
            $contract = CcContract::where('tenant_id', $tenantId)->with([
                'customer',
                'customer.project:id,name',
                'property',
                'installments' => fn ($q) => $q->orderBy('installment_number'),
            ])->find((int) $validated['contract_id']);
        }

        $projectId = (int) ($validated['project_id'] ?? ($contract?->customer?->project_id ?? 0));

        $body = (string) ($validated['body'] ?? '');
        if (trim($body) === '' && !empty($validated['template_id'])) {
            $tpl = ContractTemplate::where('tenant_id', $tenantId)->find((int) $validated['template_id']);
            if ($tpl && (string) ($tpl->content_type ?? 'html') === 'html') {
                $body = (string) ($tpl->body ?? '');
            }
        }

        $isRtl = filter_var($validated['rtl'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($isRtl === null) {
            $accept = strtolower((string) $request->header('Accept-Language', ''));
            $isRtl = Str::startsWith($accept, 'ar') || app()->getLocale() === 'ar';
        }

        $payload = $renderer->buildPreviewPayload($tenantId, $body, $projectId, $contract);
        $contractNumber = (string) (($payload['contract']?->contract_number ?? '') ?: ($payload['contract']?->id ?? ''));
        $contractDate = (string) (($payload['contract']?->contract_date?->toDateString() ?? '') ?: (string) ($payload['contract']?->contract_date ?? ''));

        return response()
            ->view('cc.contracts.print', [
                'tenant' => $payload['tenant'],
                'contractNumber' => $contractNumber ?: 'PREVIEW',
                'contractDate' => $contractDate,
                'bodyHtml' => (string) ($payload['body_html'] ?? ''),
                'dir' => $isRtl ? 'rtl' : 'ltr',
                'autoprint' => false,
            ])
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }
}
