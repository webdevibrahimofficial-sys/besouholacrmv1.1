<?php

namespace App\Services\GeneralInventory;

final class GeneralInventoryDecisionService
{
    public const DECISION_APPROVED = 'approved';
    public const DECISION_BLOCKED = 'blocked';
    public const DECISION_PENDING_APPROVAL = 'pending_approval';
    public const DECISION_ALREADY_PROCESSED = 'already_processed';
    public const DECISION_INVALID = 'invalid';

    public const STATUS_DRAFT = 'Draft';
    public const STATUS_PENDING = 'Pending';
    public const STATUS_PENDING_APPROVAL = 'PendingApproval';
    public const STATUS_APPROVED = 'Approved';
    public const STATUS_REJECTED = 'Rejected';
    public const STATUS_CHANGES_REQUESTED = 'ChangesRequested';
    public const STATUS_CONVERTED = 'Converted';
    public const STATUS_EXPIRED = 'Expired';

    /**
     * @param  list<string>  $reasons
     * @param  list<string>  $warnings
     * @param  array<string,mixed>  $snapshot
     * @return array<string,mixed>
     */
    public function result(
        string $decision,
        string $status,
        bool $allowed,
        array $reasons = [],
        array $warnings = [],
        array $snapshot = [],
        ?string $nextState = null,
    ): array {
        return [
            'decision' => $decision,
            'status' => $status,
            'allowed' => $allowed,
            'reasons' => array_values($reasons),
            'warnings' => array_values($warnings),
            'snapshot' => $snapshot,
            'next_state' => $nextState,
        ];
    }

    public function normalizeStatus(?string $status): string
    {
        $normalized = strtolower(trim((string) $status));
        $normalized = str_replace(['-', ' '], '_', $normalized);

        return match ($normalized) {
            '', 'pending' => self::STATUS_PENDING,
            'draft' => self::STATUS_DRAFT,
            'pendingapproval', 'pending_approval' => self::STATUS_PENDING_APPROVAL,
            'approved' => self::STATUS_APPROVED,
            'rejected' => self::STATUS_REJECTED,
            'changesrequested', 'changes_requested', 'request_changes' => self::STATUS_CHANGES_REQUESTED,
            'converted' => self::STATUS_CONVERTED,
            'expired' => self::STATUS_EXPIRED,
            default => (string) $status,
        };
    }

    public function isApprovedLike(?string $status): bool
    {
        return $this->normalizeStatus($status) === self::STATUS_APPROVED;
    }

    public function isRejectedLike(?string $status): bool
    {
        return $this->normalizeStatus($status) === self::STATUS_REJECTED;
    }

    public function isConvertedLike(?string $status): bool
    {
        return $this->normalizeStatus($status) === self::STATUS_CONVERTED;
    }

    public function isPendingApprovalLike(?string $status): bool
    {
        return $this->normalizeStatus($status) === self::STATUS_PENDING_APPROVAL;
    }

    public function isChangesRequestedLike(?string $status): bool
    {
        return $this->normalizeStatus($status) === self::STATUS_CHANGES_REQUESTED;
    }
}
