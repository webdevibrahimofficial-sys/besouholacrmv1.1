<?php

namespace App\Services\GeneralInventory;

use App\Models\InventoryRequest;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;

final class GeneralInventoryApprovalService
{
    public function __construct(
        private readonly GeneralInventoryDecisionService $decisions,
    ) {
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array{data:array<string,mixed>,previous_status:string,next_status:string,decision:array<string,mixed>}
     */
    public function prepareUpdate(InventoryRequest $request, array $payload, ?User $actor): array
    {
        $data = $payload;
        $previousStatus = $this->decisions->normalizeStatus($request->status);
        $requestedStatus = array_key_exists('status', $data)
            ? $this->decisions->normalizeStatus((string) $data['status'])
            : $previousStatus;
        $financialFieldsChanged = $this->financialFieldsChanged($request, $data, array_replace_recursive(
            is_array($request->meta_data) ? $request->meta_data : [],
            is_array($data['meta_data'] ?? null) ? $data['meta_data'] : [],
        ));

        if ($requestedStatus !== $previousStatus) {
            $this->assertTransitionAllowed($previousStatus, $requestedStatus, $actor);
        }

        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $incomingMeta = is_array($data['meta_data'] ?? null) ? $data['meta_data'] : [];
        $meta = array_replace_recursive($meta, $incomingMeta);

        if ($requestedStatus === GeneralInventoryDecisionService::STATUS_REJECTED) {
            $reason = trim((string) ($data['rejection_reason'] ?? $meta['approval']['rejection_reason'] ?? ''));
            if ($reason === '') {
                throw ValidationException::withMessages([
                    'rejection_reason' => 'A rejection reason is required when rejecting an inventory request.',
                ]);
            }
            $meta['approval']['rejection_reason'] = $reason;
            $meta['approval']['rejected_by_id'] = $actor?->id;
            $meta['approval']['rejected_at'] = now()->toDateTimeString();
        }

        if ($requestedStatus === GeneralInventoryDecisionService::STATUS_CHANGES_REQUESTED) {
            $reason = trim((string) ($data['rejection_reason'] ?? $data['change_request_reason'] ?? $meta['approval']['change_request_reason'] ?? ''));
            if ($reason !== '') {
                $meta['approval']['change_request_reason'] = $reason;
            }
            $meta['approval']['changes_requested_by_id'] = $actor?->id;
            $meta['approval']['changes_requested_at'] = now()->toDateTimeString();
        }

        if ($requestedStatus === GeneralInventoryDecisionService::STATUS_APPROVED) {
            $meta['approval']['approved_by_id'] = $actor?->id;
            $meta['approval']['approved_at'] = now()->toDateTimeString();
        }

        if ($this->decisions->isApprovedLike($previousStatus) && $financialFieldsChanged) {
            if ($requestedStatus !== GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL) {
                throw ValidationException::withMessages([
                    'status' => 'Approved inventory requests require re-approval after financial changes.',
                ]);
            }

            $meta['approval']['reapproval_required'] = true;
            $meta['approval']['reapproval_requested_by_id'] = $actor?->id;
            $meta['approval']['reapproval_requested_at'] = now()->toDateTimeString();
        }

        if (!empty($meta)) {
            $data['meta_data'] = $meta;
        }
        $data['status'] = $requestedStatus;
        unset($data['rejection_reason'], $data['change_request_reason']);

        $decision = $this->decisions->result(
            $requestedStatus === $previousStatus
                ? GeneralInventoryDecisionService::DECISION_APPROVED
                : ($requestedStatus === GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL
                    ? GeneralInventoryDecisionService::DECISION_PENDING_APPROVAL
                    : GeneralInventoryDecisionService::DECISION_APPROVED),
            $requestedStatus,
            true,
            [],
            [],
            [
                'inventory_request_id' => $request->id,
                'previous_status' => $previousStatus,
                'next_status' => $requestedStatus,
            ],
            $requestedStatus
        );

        return [
            'data' => $data,
            'previous_status' => $previousStatus,
            'next_status' => $requestedStatus,
            'decision' => $decision,
        ];
    }

    private function assertTransitionAllowed(string $previousStatus, string $nextStatus, ?User $actor): void
    {
        if (in_array($nextStatus, [
            GeneralInventoryDecisionService::STATUS_APPROVED,
            GeneralInventoryDecisionService::STATUS_REJECTED,
            GeneralInventoryDecisionService::STATUS_CHANGES_REQUESTED,
        ], true) && ! $this->isManagerLike($actor)) {
            throw new AuthorizationException('Only managers or admins can approve, reject, or request changes on inventory requests.');
        }

        if ($previousStatus === GeneralInventoryDecisionService::STATUS_CONVERTED && $nextStatus !== GeneralInventoryDecisionService::STATUS_CONVERTED) {
            throw ValidationException::withMessages([
                'status' => 'Converted inventory requests cannot be moved back through the approval workflow.',
            ]);
        }
    }

    /**
     * @param  array<string,mixed>  $payload
     * @param  array<string,mixed>  $meta
     */
    private function financialFieldsChanged(InventoryRequest $request, array $payload, array $meta): bool
    {
        foreach (['quantity'] as $field) {
            if (array_key_exists($field, $payload) && (string) $payload[$field] !== (string) ($request->{$field} ?? '')) {
                return true;
            }
        }

        $existingMeta = is_array($request->meta_data) ? $request->meta_data : [];
        foreach (['price', 'total', 'line_total', 'discount_amount', 'tax', 'subtotal', 'final_amount'] as $field) {
            if (array_key_exists($field, $meta) && (string) $meta[$field] !== (string) ($existingMeta[$field] ?? '')) {
                return true;
            }
        }

        return false;
    }

    private function isManagerLike(?User $actor): bool
    {
        if (! $actor) {
            return false;
        }

        if ((bool) ($actor->is_super_admin ?? false) || (bool) ($actor->is_primary_admin ?? false) || (bool) ($actor->is_tenant_admin ?? false)) {
            return true;
        }

        $roleValues = [
            strtolower(trim((string) ($actor->role ?? ''))),
            strtolower(trim((string) ($actor->job_title ?? ''))),
        ];

        return collect($roleValues)->contains(function (string $role): bool {
            return $role !== '' && (
                str_contains($role, 'admin')
                || str_contains($role, 'manager')
                || str_contains($role, 'director')
                || str_contains($role, 'team leader')
            );
        });
    }
}
