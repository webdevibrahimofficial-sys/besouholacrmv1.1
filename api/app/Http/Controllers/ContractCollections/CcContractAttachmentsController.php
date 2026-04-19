<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcAttachment;
use App\Models\CcContract;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CcContractAttachmentsController extends BaseCcController
{
    public function index(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        CcContract::where('tenant_id', $tenantId)->findOrFail($id);

        $items = CcAttachment::query()
            ->where('tenant_id', $tenantId)
            ->where('related_type', 'contract')
            ->where('related_id', $id)
            ->orderByDesc('id')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        CcContract::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'files' => 'required|array|min:1|max:10',
            'files.*' => 'file|max:15360|mimetypes:application/pdf,image/jpeg,image/png,image/webp',
        ]);

        $saved = [];
        foreach ($data['files'] as $file) {
            $ext = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');
            $path = $file->storeAs(
                'contracts/' . $tenantId . '/' . $id,
                now()->format('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.' . $ext,
                'public'
            );

            $meta = [
                'original_name' => $file->getClientOriginalName(),
                'size' => (int) $file->getSize(),
                'mime' => (string) ($file->getMimeType() ?? ''),
            ];

            $att = CcAttachment::create([
                'tenant_id' => $tenantId,
                'related_type' => 'contract',
                'related_id' => $id,
                'file_path' => $path,
                'file_type' => $meta['mime'] ?: null,
                'uploaded_by' => $request->user()?->id,
                'meta_data' => $meta,
            ]);

            try {
                activity('contract_collections')
                    ->causedBy($request->user())
                    ->performedOn($att)
                    ->withProperties([
                        'action' => 'contract_attachment_uploaded',
                        'contract_id' => $id,
                        'attachment_id' => $att->id,
                        'file_path' => $path,
                        'meta' => $meta,
                    ])
                    ->log('cc_contract_attachment');
            } catch (\Throwable $e) {
            }

            $saved[] = $att;
        }

        return response()->json(['data' => $saved], 201);
    }

    public function destroy(Request $request, int $id, int $attachmentId)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        CcContract::where('tenant_id', $tenantId)->findOrFail($id);

        $att = CcAttachment::query()
            ->where('tenant_id', $tenantId)
            ->where('related_type', 'contract')
            ->where('related_id', $id)
            ->findOrFail($attachmentId);

        $path = (string) ($att->file_path ?? '');
        if ($path) {
            try {
                Storage::disk('public')->delete($path);
            } catch (\Throwable $e) {
            }
        }

        $att->delete();

        try {
            activity('contract_collections')
                ->causedBy($request->user())
                ->performedOn($att)
                ->withProperties([
                    'action' => 'contract_attachment_deleted',
                    'contract_id' => $id,
                    'attachment_id' => $attachmentId,
                    'file_path' => $path,
                ])
                ->log('cc_contract_attachment');
        } catch (\Throwable $e) {
        }

        return response()->noContent();
    }
}
