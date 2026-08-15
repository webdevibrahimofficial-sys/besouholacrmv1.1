<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\Lead;
use App\Models\User;
use App\Notifications\DuplicateLeadWarning;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\Schema;

class DuplicateLeadService
{
    /**
     * Apply the same phone-based duplicate rules used by manual lead creation.
     *
     * @param  array<string, mixed>  $leadData
     * @return array{data: array<string, mixed>, is_duplicate: bool, duplicate_of_id: ?int, existing_duplicate: ?Lead}
     */
    public function apply(int|string $tenantId, array $leadData, string $context = 'meta'): array
    {
        if (!$this->isDuplicationEnabled($tenantId)) {
            return $this->freshResult($leadData);
        }

        $rawPhone = trim((string) ($leadData['phone'] ?? ''));
        if ($rawPhone === '') {
            return $this->freshResult($leadData);
        }

        $meta = is_array($leadData['meta_data'] ?? null) ? $leadData['meta_data'] : [];
        $phoneCountryHint = is_string($meta['phone_country'] ?? null) ? $meta['phone_country'] : null;
        $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountryHint);
        $variants = !empty($variants) ? $variants : [$rawPhone];
        $workflowKey = strtolower(trim((string) ($leadData['workflow_key'] ?? '')));
        $incomingMetaId = trim((string) ($leadData['meta_id'] ?? ''));

        $base = Lead::query();
        $this->applyDuplicateWorkflowScope($base, $tenantId, $workflowKey);
        if ($incomingMetaId !== '') {
            $base->where(function ($query) use ($incomingMetaId) {
                $query->whereNull('meta_id')->orWhere('meta_id', '!=', $incomingMetaId);
            });
        }

        $hasExceptionColumn = Schema::hasColumn('leads', 'is_duplicate_exception');
        $isDuplicate = (clone $base)
            ->whereIn('phone', $variants)
            ->when($hasExceptionColumn, function ($query) {
                $query->where(function ($inner) {
                    $inner->whereNull('is_duplicate_exception')->orWhere('is_duplicate_exception', false);
                });
            })
            ->exists();

        if (!$isDuplicate) {
            return $this->freshResult($leadData);
        }

        $originalQuery = (clone $base)
            ->whereIn('phone', $variants)
            ->where(function ($query) {
                $query->whereNull('status')->orWhere('status', '!=', 'duplicate');
            })
            ->when($hasExceptionColumn, function ($query) {
                $query->where(function ($inner) {
                    $inner->whereNull('is_duplicate_exception')->orWhere('is_duplicate_exception', false);
                });
            })
            ->orderBy('id', 'asc');

        $original = $originalQuery->first()
            ?: (clone $base)->whereIn('phone', $variants)->orderBy('id', 'asc')->first();

        $duplicateOfId = $this->resolveDuplicateRootId($original, $tenantId);
        if (!$duplicateOfId) {
            return $this->freshResult($leadData);
        }

        $enteredStage = $this->sanitizeDuplicateEnteredStage($leadData['stage'] ?? null);
        if ($enteredStage !== null) {
            $meta['entered_stage'] = $enteredStage;
        }
        $meta['duplicate_of'] = $duplicateOfId;

        $leadData['meta_data'] = $meta;
        $leadData['status'] = 'duplicate';
        $leadData['stage'] = 'Duplicate';

        $attempt = $this->buildDuplicateAttemptMeta($leadData, $meta, $context);
        $leadData['meta_data'] = $this->bumpDuplicateAttemptMeta($leadData['meta_data'], $attempt);

        $existingDuplicate = $this->findActiveDuplicateLead($tenantId, $variants, (int) $duplicateOfId);
        if ($existingDuplicate && $incomingMetaId !== '' && (string) $existingDuplicate->meta_id === $incomingMetaId) {
            $existingDuplicate = null;
        }

        return [
            'data' => $leadData,
            'is_duplicate' => true,
            'duplicate_of_id' => (int) $duplicateOfId,
            'existing_duplicate' => $existingDuplicate,
        ];
    }

    public function notifyIfNewDuplicate(Lead $lead, ?int $duplicateOfId): void
    {
        if (!$duplicateOfId) {
            return;
        }

        try {
            $original = Lead::query()
                ->when($lead->tenant_id, fn ($query) => $query->where('tenant_id', $lead->tenant_id))
                ->find($duplicateOfId);
            if (!$original) {
                return;
            }

            $recipients = $this->getDuplicateNotificationRecipients($lead->tenant_id);
            $notification = new DuplicateLeadWarning($lead, $original);
            foreach ($recipients as $recipient) {
                try {
                    $recipient->notify($notification);
                } catch (\Throwable) {
                }
            }
        } catch (\Throwable) {
        }
    }

    private function isDuplicationEnabled(int|string $tenantId): bool
    {
        try {
            if (Schema::hasTable((new CrmSetting)->getTable())) {
                $record = CrmSetting::query()->where('tenant_id', $tenantId)->first();
                if ($record) {
                    return (bool) (CrmSetting::resolved($record)['duplicationSystem'] ?? true);
                }
            }
        } catch (\Throwable) {
        }

        if (is_numeric($tenantId)) {
            return CrmSetting::isDuplicationEnabled((int) $tenantId);
        }

        return (bool) (CrmSetting::defaults()['duplicationSystem'] ?? true);
    }

    private function freshResult(array $leadData): array
    {
        return [
            'data' => $leadData,
            'is_duplicate' => false,
            'duplicate_of_id' => null,
            'existing_duplicate' => null,
        ];
    }

    private function applyDuplicateWorkflowScope($query, int|string|null $tenantId, ?string $workflowKey): void
    {
        if ($tenantId !== null && $tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        $normalizedWorkflow = strtolower(trim((string) ($workflowKey ?? '')));
        if ($normalizedWorkflow === '' || !Schema::hasColumn('leads', 'workflow_key')) {
            return;
        }

        if ($normalizedWorkflow === TelesalesService::WORKFLOW_SALES) {
            $query->where(function ($workflowQuery) {
                $workflowQuery->where('workflow_key', TelesalesService::WORKFLOW_SALES)
                    ->orWhereNull('workflow_key')
                    ->orWhere('workflow_key', '');
            });
        } else {
            $query->where('workflow_key', $normalizedWorkflow);
        }

        if ($normalizedWorkflow === TelesalesService::WORKFLOW_TELESALES
            && Schema::hasColumn('leads', 'transferred_to_sales_at')) {
            $query->whereNull('transferred_to_sales_at');
        }
    }

    private function resolveDuplicateRootId(?Lead $lead, int|string|null $tenantId = null): ?int
    {
        if (!$lead) {
            return null;
        }

        $seen = [];
        $current = $lead;

        for ($i = 0; $i < 10; $i++) {
            $id = (int) ($current->id ?? 0);
            if ($id <= 0) {
                return null;
            }
            if (isset($seen[$id])) {
                return $id;
            }
            $seen[$id] = true;

            $meta = is_array($current->meta_data ?? null) ? ($current->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (!is_numeric($dupOf) || (int) $dupOf <= 0) {
                return $id;
            }

            $nextQuery = Lead::query()->where('id', (int) $dupOf);
            if ($tenantId !== null && $tenantId !== '') {
                $nextQuery->where('tenant_id', $tenantId);
            }
            $next = $nextQuery->first();
            if (!$next) {
                return $id;
            }
            $current = $next;
        }

        return (int) ($current->id ?? null);
    }

    private function findActiveDuplicateLead(int|string|null $tenantId, array $phoneVariants, ?int $duplicateOfId): ?Lead
    {
        if (!$duplicateOfId || empty($phoneVariants)) {
            return null;
        }

        $query = Lead::query()
            ->whereIn('phone', $phoneVariants)
            ->where(function ($inner) {
                $inner->whereRaw("lower(coalesce(status, '')) = 'duplicate'")
                    ->orWhereRaw("lower(coalesce(stage, '')) = 'duplicate'");
            })
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(20);

        if ($tenantId !== null && $tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        foreach ($query->get() as $candidate) {
            $meta = is_array($candidate->meta_data ?? null) ? ($candidate->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (is_numeric($dupOf) && (int) $dupOf === (int) $duplicateOfId) {
                return $candidate;
            }
        }

        return null;
    }

    private function sanitizeDuplicateEnteredStage($stage): ?string
    {
        $stage = trim((string) $stage);
        if ($stage === '' || strtolower($stage) === 'duplicate') {
            return null;
        }

        return $stage;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $meta
     * @return array<string, mixed>
     */
    private function buildDuplicateAttemptMeta(array $data, array $meta, string $context): array
    {
        return array_filter([
            'at' => now()->toIso8601String(),
            'context' => $context,
            'entered_stage' => isset($meta['entered_stage']) ? (string) $meta['entered_stage'] : null,
            'source' => isset($data['source']) ? (string) $data['source'] : null,
            'project' => isset($data['project']) ? (string) $data['project'] : null,
            'assigned_to' => $data['assigned_to'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');
    }

    /**
     * @param  array<string, mixed>  $meta
     * @param  array<string, mixed>  $attempt
     * @return array<string, mixed>
     */
    private function bumpDuplicateAttemptMeta(array $meta, array $attempt): array
    {
        $count = (int) ($meta['duplicate_attempts_count'] ?? 0);
        $count++;
        $meta['duplicate_attempts_count'] = $count;
        $meta['last_duplicate_at'] = now()->toDateTimeString();

        $attempts = is_array($meta['duplicate_attempts'] ?? null) ? $meta['duplicate_attempts'] : [];
        if (!empty($attempt)) {
            $attempts[] = $attempt;
        }
        if (count($attempts) > 20) {
            $attempts = array_slice($attempts, -20);
        }
        $meta['duplicate_attempts'] = $attempts;

        return $meta;
    }

    private function getDuplicateNotificationRecipients(int|string|null $tenantId)
    {
        if ($tenantId === null || $tenantId === '') {
            return collect();
        }

        $roleNamesLower = [
            'admin', 'tenant admin', 'tenant-admin', 'director',
            'operation manager', 'operations manager', 'sales manager',
            'sales admin', 'branch manager', 'team leader',
        ];

        return User::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($query) use ($roleNamesLower) {
                $query->where(function ($sub) use ($roleNamesLower) {
                    foreach ($roleNamesLower as $role) {
                        $sub->orWhereRaw("lower(coalesce(role, '')) = ?", [$role]);
                        $sub->orWhereRaw("lower(coalesce(job_title, '')) = ?", [$role]);
                    }
                })->orWhereHas('roles', function ($roleQuery) use ($roleNamesLower) {
                    $roleQuery->whereIn('name', $roleNamesLower);
                });
            })
            ->get();
    }
}
