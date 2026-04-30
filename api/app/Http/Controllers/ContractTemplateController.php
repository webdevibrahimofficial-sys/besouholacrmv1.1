<?php

namespace App\Http\Controllers;

use App\Models\ContractTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

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
}
