<?php

namespace App\Services\Imports\Handlers;

use App\Models\CancelReason;
use App\Models\CrmSetting;
use App\Models\ImportJob;
use App\Models\ImportJobRow;
use App\Models\Item;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\InventoryRequest;
use App\Models\Project;
use App\Models\RealEstateRequest;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Visit;
use App\Services\Imports\Contracts\ImportHandler;
use App\Services\TelesalesService;
use App\Support\PhoneNormalizer;
use App\Support\LeadStageResolver;
use App\Support\TenantSourceLookup;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class LeadsImportHandler implements ImportHandler
{
    private function applyDuplicateWorkflowScope($query, ?int $tenantId, ?string $workflowKey): void
    {
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $normalizedWorkflow = strtolower(trim((string) ($workflowKey ?? '')));
        if ($normalizedWorkflow === '' || !Schema::hasColumn('leads', 'workflow_key')) {
            return;
        }

        $query->where('workflow_key', $normalizedWorkflow);

        if ($normalizedWorkflow === TelesalesService::WORKFLOW_TELESALES
            && Schema::hasColumn('leads', 'transferred_to_sales_at')) {
            $query->whereNull('transferred_to_sales_at');
        }
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @param array<string, string> $mapping
     * @param array<string, mixed> $options
     */
    public function handle(ImportJob $job, array $rows, array $mapping, array $options = []): void
    {
        $tenantId = $job->tenant_id;
        $uploaderId = $job->uploaded_by;
        $phoneCountryHint = isset($options['phone_country']) ? (string) $options['phone_country'] : null;
        $forcedWorkflowKey = strtolower(trim((string) ($options['workflow_key'] ?? '')));
        $isTelesalesImport = $forcedWorkflowKey === TelesalesService::WORKFLOW_TELESALES;

        $crm = CrmSetting::first();
        $enableDup = is_array($crm?->settings) ? (bool) ($crm->settings['duplicationSystem'] ?? false) : false;

        $companyType = '';
        try {
            $tenant = $tenantId ? Tenant::find($tenantId) : null;
            $companyType = strtolower((string) ($tenant?->company_type ?? ''));
        } catch (\Throwable $e) {
            $companyType = '';
        }
        $isGeneral = $companyType === 'general';

        $seenPhones = [];
        $firstLeadIdByPhone = [];

        $totalRows = 0;
        $successRows = 0;
        $failedRows = 0;
        $duplicateRows = 0;
        $skippedRows = 0;
        $warningRows = 0;

        $allowedColumns = $this->allowedLeadColumns();
        foreach ($rows as $index => $rawRow) {
            $totalRows++;
            $rowNumber = $this->rowNumberFromOptions($options, $index);

            $warnings = [];
            if (!is_array($rawRow)) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'failed',
                    'reason_code' => 'invalid_row',
                    'reason_message' => 'Row is not an object.',
                    'raw_data' => $rawRow,
                    'normalized_data' => null,
                    'warnings' => [],
                    'entity_type' => 'leads',
                ]);
                $failedRows++;
                continue;
            }

            $normalized = $this->mapRow($rawRow, $mapping);
            if (!array_key_exists('notes', $normalized) && array_key_exists('note', $normalized)) {
                $normalized['notes'] = $normalized['note'];
            }

            $normalized = array_merge([
                'tenant_id' => $tenantId,
                'source' => 'import',
                'status' => $normalized['status'] ?? 'new',
                'priority' => $normalized['priority'] ?? 'medium',
            ], $normalized);
            $normalized['priority'] = $this->normalizeLeadPriority($normalized['priority'] ?? null);

            // Normalize phone early
            $rawPhone = isset($normalized['phone']) ? trim((string) $normalized['phone']) : '';
            $rowPhoneCountryHint = isset($normalized['phone_country']) ? trim((string) $normalized['phone_country']) : '';
            $rowPhoneCountryHint = $rowPhoneCountryHint !== '' ? $rowPhoneCountryHint : $phoneCountryHint;
            if ($rawPhone !== '') {
                $normalizedPhone = PhoneNormalizer::normalize($rawPhone, $rowPhoneCountryHint);
                $normalized['phone'] = $normalizedPhone;
            } else {
                $normalized['phone'] = '';
            }

            $rawOtherPhone = trim((string) ($normalized['other_mobile'] ?? $normalized['otherMobile'] ?? ''));
            if ($rawOtherPhone !== '') {
                $normalizedOtherPhone = PhoneNormalizer::normalize($rawOtherPhone, $rowPhoneCountryHint);
                if ($normalizedOtherPhone !== '') {
                    if (array_key_exists('other_mobile', $allowedColumns)) {
                        $normalized['other_mobile'] = $normalizedOtherPhone;
                    } else {
                        $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
                        $meta['other_mobile'] = $normalizedOtherPhone;
                        $normalized['meta_data'] = $meta;
                    }
                }
            }

            // Extract optional fields we may use after create.
            $assignedToRaw = trim((string) ($normalized['assignedTo'] ?? $normalized['assigned_to'] ?? ''));
            $nextActionDate = trim((string) ($normalized['next_action_date'] ?? $normalized['nextActionDate'] ?? ''));
            $nextActionTime = trim((string) ($normalized['next_action_time'] ?? $normalized['nextActionTime'] ?? ''));
            $creationDateRaw = trim((string) ($normalized['creation_date'] ?? $normalized['creationDate'] ?? $normalized['created_at'] ?? $normalized['createdAt'] ?? ''));
            $firstActionDateRaw = trim((string) ($normalized['first_action_date'] ?? $normalized['firstActionDate'] ?? $normalized['last_action_date'] ?? $normalized['lastActionDate'] ?? $normalized['action_date'] ?? $normalized['actionDate'] ?? ''));
            $cancelReasonRaw = trim((string) ($normalized['cancel_reason'] ?? $normalized['cancelReason'] ?? $normalized['reason'] ?? $normalized['reason_text'] ?? ''));
            $cancelReason = $this->resolveCancelReason($tenantId, $cancelReasonRaw);
            $comment = trim((string) ($normalized['comment'] ?? $normalized['comments'] ?? ''));
            $phoneCountry = trim((string) ($normalized['phone_country'] ?? ''));
            $importAuditFields = array_filter([
                'assignedTo' => $assignedToRaw !== '' ? $assignedToRaw : null,
                'creation_date' => $creationDateRaw !== '' ? $creationDateRaw : null,
                'first_action_date' => $firstActionDateRaw !== '' ? $firstActionDateRaw : null,
                'next_action_date' => $nextActionDate !== '' ? $nextActionDate : null,
                'next_action_time' => $nextActionTime !== '' ? $nextActionTime : null,
                'cancel_reason' => $cancelReason?->title ?: ($cancelReasonRaw !== '' ? $cancelReasonRaw : null),
                'comment' => $comment !== '' ? $comment : null,
                'phone_country' => $phoneCountry !== '' ? $phoneCountry : null,
            ], fn ($value) => $value !== null && $value !== '');

            // Required fields (match legacy bulk-import behavior): Name, Phone, Source, and (Project OR Item based on tenant type).
            $name = trim((string) ($normalized['name'] ?? ''));
            $sourceName = trim((string) ($normalized['source'] ?? ''));
            $phone = trim((string) ($normalized['phone'] ?? ''));

            $missing = [];
            if ($name === '') $missing[] = 'Name';
            if ($rawPhone === '' || $phone === '') $missing[] = 'Phone';
            if ($sourceName === '') $missing[] = 'Source';
            if (!empty($missing)) {
                $fieldErrors = [];
                if ($name === '') $fieldErrors['name'] = 'Name is required.';
                if ($rawPhone === '' || $phone === '') $fieldErrors['phone'] = 'Phone is required.';
                if ($sourceName === '') $fieldErrors['source'] = 'Source is required.';
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => 'missing_required_fields',
                    'reason_message' => 'Missing required fields (' . implode(', ', $missing) . '). Row skipped.',
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, $fieldErrors),
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                ]);
                $skippedRows++;
                continue;
            }

            $resolvedSourceName = TenantSourceLookup::resolveName($tenantId, $sourceName);
            if (!$resolvedSourceName) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => 'source_not_found',
                    'reason_message' => "Source '{$sourceName}' not found in sources table. Row skipped.",
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, ['source' => "Source '{$sourceName}' not found in sources table."]),
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                ]);
                $skippedRows++;
                continue;
            }
            $normalized['source'] = $resolvedSourceName;
            $sourceName = $resolvedSourceName;

            $email = trim((string) ($normalized['email'] ?? ''));
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'failed',
                    'reason_code' => 'invalid_email',
                    'reason_message' => 'Invalid email format.',
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, ['email' => 'Invalid email format.']),
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                ]);
                $failedRows++;
                continue;
            }

            // Project/Item resolution (match legacy bulk-import behavior)
            $projectName = trim((string) ($normalized['project'] ?? ''));
            $itemName = trim((string) ($normalized['item'] ?? ''));
            $projectId = null;
            $itemId = null;

            if ($isGeneral) {
                if ($itemName === '' && $projectName !== '') {
                    $itemName = $projectName;
                    $warnings[] = [
                        'code' => 'project_used_as_item',
                        'message' => "Project value '{$projectName}' was used as Item for this general-company import.",
                        'field' => 'project',
                    ];
                }

                if ($itemName === '') {
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'missing_item',
                        'reason_message' => 'Item is required for general companies. Row skipped.',
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['item' => 'Item is required.']),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }

                $item = Item::where('tenant_id', $tenantId)
                    ->where(function ($q) use ($itemName) {
                        $q->where('name', $itemName)->orWhere('code', $itemName);
                    })
                    ->first();
                if (!$item) {
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'item_not_found',
                        'reason_message' => "Item '{$itemName}' not found. Row skipped.",
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['item' => "Item '{$itemName}' not found."]),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }

                $itemId = (int) $item->id;
                $itemName = (string) ($item->name ?? $itemName);
                $normalized['item_id'] = $itemId;
                $normalized['item'] = $itemName;
            } else {
                if ($projectName === '' && $itemName !== '') {
                    $projectName = $itemName;
                    $warnings[] = [
                        'code' => 'item_used_as_project',
                        'message' => "Item value '{$itemName}' was used as Project for this import.",
                        'field' => 'item',
                    ];
                }

                if ($projectName === '') {
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'missing_project',
                        'reason_message' => 'Project is required. Row skipped.',
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['project' => 'Project is required.']),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }

                $project = Project::where('tenant_id', $tenantId)
                    ->where(function ($q) use ($projectName) {
                        $q->where('name', $projectName)->orWhere('name_ar', $projectName);
                    })
                    ->first();
                if (!$project) {
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'project_not_found',
                        'reason_message' => "Project '{$projectName}' not found. Row skipped.",
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['project' => "Project '{$projectName}' not found."]),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }

                $projectId = (int) $project->id;
                $projectName = (string) ($project->name ?? $projectName);
                $normalized['project_id'] = $projectId;
                $normalized['project'] = $projectName;
            }

            $incomingStage = trim((string) ($normalized['stage'] ?? ''));
            if ($isTelesalesImport) {
                $resolvedTelesalesStage = $this->resolveWorkflowStage($tenantId, TelesalesService::WORKFLOW_TELESALES, $incomingStage);
                if (!$resolvedTelesalesStage && $incomingStage === '') {
                    $resolvedTelesalesStage = $this->resolveWorkflowEntryStage($tenantId, TelesalesService::WORKFLOW_TELESALES);
                }

                if (!$resolvedTelesalesStage) {
                    $stageLabel = $incomingStage !== '' ? $incomingStage : '(empty)';
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'stage_not_found',
                        'reason_message' => "Telesales stage '{$stageLabel}' is not configured for this tenant. Row skipped.",
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['stage' => "Telesales stage '{$stageLabel}' is not configured for this tenant."]),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }

                $resolvedStage = trim((string) $resolvedTelesalesStage->name);
                $normalized['workflow_key'] = TelesalesService::WORKFLOW_TELESALES;
                $normalized['stage_id'] = (int) $resolvedTelesalesStage->id;
                $normalized['workflow_entered_at'] = now();
            } else {
                $resolvedStage = LeadStageResolver::resolve($tenantId, $incomingStage, true);
                if ($resolvedStage === null) {
                    $stageLabel = $incomingStage !== '' ? $incomingStage : '(empty)';
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'skipped',
                        'reason_code' => 'stage_not_found',
                        'reason_message' => "Stage '{$stageLabel}' is not allowed for this tenant. Row skipped.",
                        'raw_data' => $rawRow,
                        'normalized_data' => $this->withFieldErrors($normalized, ['stage' => "Stage '{$stageLabel}' is not allowed for this tenant."]),
                        'warnings' => $warnings,
                        'entity_type' => 'leads',
                    ]);
                    $skippedRows++;
                    continue;
                }
            }

            $normalized['stage'] = $resolvedStage;
            $resolvedStageType = $this->resolveStageType(
                $tenantId,
                $incomingStage,
                (string) $resolvedStage,
                $isTelesalesImport ? TelesalesService::WORKFLOW_TELESALES : null
            );
            $isCancelStage = $this->isCancelStageLike($tenantId, $incomingStage, (string) $resolvedStage, $resolvedStageType);

            // Store common template fields inside meta_data (best-effort).
            $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
            if ($phoneCountry !== '') {
                $meta['phone_country'] = $phoneCountry;
            }
            if ($cancelReason) {
                $meta['cancel_reason_id'] = (int) $cancelReason->id;
                $meta['cancel_reason'] = trim((string) $cancelReason->title);
                if (trim((string) $cancelReason->title_ar) !== '') {
                    $meta['cancel_reason_ar'] = trim((string) $cancelReason->title_ar);
                }
            } elseif ($cancelReasonRaw !== '') {
                $meta['cancel_reason'] = $cancelReasonRaw;
            }
            $normalized['meta_data'] = $meta;
            if (array_key_exists('phone_country', $normalized)) {
                unset($normalized['phone_country']);
            }
            if (array_key_exists('phoneCountry', $normalized)) {
                unset($normalized['phoneCountry']);
            }

            $enteredStage = trim((string) ($normalized['stage'] ?? ''));

            $isInFileDup = false;
            if (isset($seenPhones[$phone])) {
                $isInFileDup = true;
            } else {
                $seenPhones[$phone] = true;
            }

            $isDbDup = false;
            $duplicateOfId = null;
            $variantsForSearch = [$phone];

            if ($enableDup) {
                $variants = PhoneNormalizer::variantsForSearch($rawPhone !== '' ? $rawPhone : $phone, $rowPhoneCountryHint);
                $variants = !empty($variants) ? $variants : [$phone];
                $variantsForSearch = $variants;

                $base = Lead::query();
                $this->applyDuplicateWorkflowScope($base, $tenantId, $forcedWorkflowKey);
                $isDbDup = (clone $base)->whereIn('phone', $variants)->exists();

                if ($isDbDup) {
                    $original = (clone $base)->whereIn('phone', $variants)
                        ->where(function ($q) {
                            $q->whereNull('status')->orWhere('status', '!=', 'duplicate');
                        })
                        ->orderBy('id', 'asc')
                        ->first();
                    if (!$original) {
                        $original = (clone $base)->whereIn('phone', $variants)->orderBy('id', 'asc')->first();
                    }
                    $duplicateOfId = $this->resolveDuplicateRootId($original, $tenantId);
                }
            }

            // In-file duplicates should also be tracked as duplicates and linked to the first imported lead with that phone.
            if ($isInFileDup) {
                $duplicateOfId = $duplicateOfId ?: ($firstLeadIdByPhone[$phone] ?? null);
            }

            if ($enableDup && ($isDbDup || $isInFileDup)) {
                $normalized['status'] = 'duplicate';
                $normalized['stage'] = 'Duplicate';
                if ($isTelesalesImport && array_key_exists('stage_id', $normalized)) {
                    $normalized['stage_id'] = null;
                }
                $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
                if ($enteredStage !== '') {
                    $meta['entered_stage'] = $enteredStage;
                }
                if ($duplicateOfId) {
                    $meta['duplicate_of'] = (int) $duplicateOfId;
                }
                $meta['import_job_id'] = (int) $job->id;
                $normalized['meta_data'] = $meta;
            } else {
                $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
                $meta['import_job_id'] = (int) $job->id;
                $normalized['meta_data'] = $meta;
            }

            // Normalize common camelCase keys coming from the frontend/import wizard.
            if (!array_key_exists('estimated_value', $normalized) && array_key_exists('estimatedValue', $normalized)) {
                $normalized['estimated_value'] = $normalized['estimatedValue'];
            }

            // Do not allow setting created_by from file; always set uploader.
            $normalized['created_by'] = $uploaderId;

            // Strip fields that are not columns (best-effort).
            unset($normalized['custom_fields'], $normalized['attachments']);
            $normalized = $this->filterToAllowedColumns($normalized, $allowedColumns);
            $normalizedForAudit = array_merge($normalized, $importAuditFields);

            try {
                $isDuplicateRow = ($enableDup && ($isDbDup || $isInFileDup));
                $upsertedExistingDuplicate = false;

                if ($isDuplicateRow) {
                    $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
                    $attempt = array_filter([
                        'at' => now()->toIso8601String(),
                        'context' => 'import_job',
                        'by_id' => $uploaderId,
                        'entered_stage' => isset($meta['entered_stage']) ? (string) $meta['entered_stage'] : null,
                        'import_job_id' => (int) $job->id,
                        'row_number' => $rowNumber,
                    ], fn ($v) => $v !== null && $v !== '');
                    $meta = $this->bumpDuplicateAttemptMeta($meta, $attempt);
                    $normalized['meta_data'] = $meta;
                }

                $lead = null;
                if ($isDuplicateRow && $duplicateOfId) {
                    $existingDup = $this->findActiveDuplicateLead($tenantId, $variantsForSearch, (int) $duplicateOfId);
                    if ($existingDup) {
                        $update = $normalized;
                        unset($update['tenant_id'], $update['created_by']);
                        $existingDup->fill($update);
                        $existingDup->save();
                        $lead = $existingDup;
                        $upsertedExistingDuplicate = true;
                    }
                }

                if (!$lead) {
                    $lead = Lead::create($normalized);
                }

                $createdId = (int) ($lead->id ?? 0);

                $creationDate = $this->parseYmdDate($creationDateRaw);
                if ($creationDate && !$upsertedExistingDuplicate) {
                    $lead->timestamps = false;
                    $lead->forceFill([
                        'created_at' => $creationDate->copy(),
                        'updated_at' => $creationDate->copy(),
                    ])->save();
                    $lead->timestamps = true;
                }

                $firstActionDate = $this->parseYmdDate($firstActionDateRaw);
                if ($firstActionDate && !$upsertedExistingDuplicate) {
                    $lead->forceFill([
                        'last_action_at' => $firstActionDate->copy(),
                        'last_contact' => $firstActionDate->copy(),
                    ])->save();
                }

                if (!$isDuplicateRow && !isset($firstLeadIdByPhone[$phone]) && $createdId > 0) {
                    $firstLeadIdByPhone[$phone] = $createdId;
                }

                $nextActionAt = $this->parseImportedNextActionAt($nextActionDate, $nextActionTime);

                // Sales Person Assignment (optional). If not found, keep the row as success and add a warning.
                if ($assignedToRaw !== '') {
                    $assignedToNorm = mb_strtolower(trim($assignedToRaw), 'UTF-8');
                    $assignedToNorm = preg_replace('/\s+/u', ' ', $assignedToNorm);
                    $assignedToNoSpace = preg_replace('/\s+/u', '', $assignedToNorm);
                    $placeholders = ['sales person', 'salesperson', 'اسم البائع', 'اسمالبائع'];
                    if (in_array($assignedToNorm, $placeholders, true) || in_array($assignedToNoSpace, $placeholders, true)) {
                        $assignedToRaw = '';
                    }
                }

                if ($assignedToRaw !== '') {
                    $assignedUser = User::where('tenant_id', $tenantId)
                        ->where(function ($q) use ($assignedToRaw) {
                            $q->where('id', $assignedToRaw)->orWhere('name', 'LIKE', "%{$assignedToRaw}%");
                        })
                        ->first();

                    if ($assignedUser) {
                        $lead->assigned_to = $assignedUser->id;
                        $lead->sales_person = $assignedUser->name;
                        $lead->save();
                    } else {
                        $warnings[] = ['code' => 'sales_person_not_found', 'message' => "Sales Person '{$assignedToRaw}' not found.", 'field' => 'assignedTo'];
                    }
                }

                $importedOperationalType = $this->resolveImportedOperationalType(
                    $tenantId,
                    $incomingStage,
                    (string) ($normalized['stage'] ?? ''),
                    $resolvedStageType
                );
                $shouldIgnoreNextAction = $this->shouldIgnoreNextActionForStage(
                    $resolvedStageType,
                    $incomingStage,
                    (string) ($normalized['stage'] ?? '')
                );
                $effectiveNextActionAt = $shouldIgnoreNextAction ? null : $nextActionAt;
                $shouldCollapseIntoOperationalAction = in_array($importedOperationalType, ['meeting', 'proposal', 'reservation', 'rent', 'follow_up'], true);

                $operationAt = $firstActionDate
                    ?: $effectiveNextActionAt
                    ?: $creationDate
                    ?: now();

                $this->createOperationalRecordsFromImportedStage(
                    $lead,
                    $importedOperationalType,
                    $operationAt,
                    $uploaderId,
                    $isGeneral,
                    array_filter([
                        'imported_comment' => $comment !== '' ? $comment : null,
                        'imported_next_action_date' => $effectiveNextActionAt?->toDateString(),
                        'imported_next_action_time' => $effectiveNextActionAt?->format('H:i'),
                    ], fn ($value) => $value !== null && $value !== '')
                );

                $importedStageName = trim((string) ($normalized['stage'] ?? ''));

                // Next action creation (optional, best-effort).
                // Create a next action only when the imported stage maps to a known operational type.
                if ($effectiveNextActionAt && $importedOperationalType !== null && !$shouldCollapseIntoOperationalAction) {
                    $time = $effectiveNextActionAt->format('H:i');
                    try {
                        $actionCreatedAt = $firstActionDate ?: $creationDate ?: $effectiveNextActionAt;
                        $nextActionType = match ($importedOperationalType) {
                            'meeting' => 'meeting',
                            'proposal' => 'proposal',
                            'reservation' => 'reservation',
                            'rent' => 'rent',
                            'follow_up' => 'follow_up',
                            default => 'call',
                        };
                        $action = new LeadAction([
                            'lead_id' => $lead->id,
                            'tenant_id' => $tenantId,
                            'user_id' => $lead->assigned_to ?: $uploaderId,
                            'action_type' => $nextActionType,
                            'description' => $comment !== '' ? $comment : 'Imported next action',
                            'stage_id_at_creation' => $lead->stage_id ?: null,
                            'next_action_type' => $nextActionType,
                            'details' => array_filter([
                                'date' => $effectiveNextActionAt->toDateString(),
                                'time' => $time,
                                'status' => 'scheduled',
                                'source' => 'import',
                                'priority' => $lead->priority ?? 'medium',
                                'imported_stage' => $importedStageName !== '' ? $importedStageName : null,
                                'stage_at_creation_name' => $importedStageName !== '' ? $importedStageName : null,
                            ], fn ($v) => $v !== null && $v !== ''),
                        ]);
                        if ($actionCreatedAt) {
                            $action->created_at = $actionCreatedAt->copy();
                            $action->updated_at = $actionCreatedAt->copy();
                        }
                        $action->save();
                    } catch (\Throwable $e) {
                        $warnings[] = ['code' => 'next_action_failed', 'message' => "Failed to create next action ({$e->getMessage()}).", 'field' => 'next_action_date'];
                    }
                }

                // Import comments -> record as an action (so it appears in Last Comment + Actions timeline).
                // If an Action Date is provided in the sheet, use it as the action "performed at" date (and created_at)
                // so that it counts as an action performed on that date.
                if ($comment !== '' && !$shouldCollapseIntoOperationalAction && !$effectiveNextActionAt && !$isCancelStage) {
                    $actionDateRaw = trim((string) ($normalized['action_date'] ?? $normalized['actionDate'] ?? $firstActionDateRaw ?? $creationDateRaw ?? ''));
                    $actionAt = $this->parseYmdDate($actionDateRaw);
                    try {
                        $details = [
                            'status' => 'done',
                            'source' => 'import',
                            'import_job_id' => (int) $job->id,
                            'imported_stage' => $importedStageName !== '' ? $importedStageName : null,
                            'stage_at_creation_name' => $importedStageName !== '' ? $importedStageName : null,
                        ];

                        if ($actionAt) {
                            $details['date'] = $actionAt->toDateString();
                            // Best-effort: if the input carried a time, Carbon::parse will preserve it.
                            $details['time'] = $actionAt->format('H:i');
                        } else {
                            $warnings[] = [
                                'code' => 'missing_action_date',
                                'message' => 'Comment was imported without Action Date; using import time.',
                                'field' => 'action_date',
                            ];
                        }

                        $action = new LeadAction([
                            'lead_id' => $lead->id,
                            'tenant_id' => $tenantId,
                            // Prefer attributing the action to the lead owner if assigned, otherwise the uploader.
                            'user_id' => $lead->assigned_to ?: $uploaderId,
                            'action_type' => 'comment',
                            'description' => $comment,
                            'stage_id_at_creation' => $lead->stage_id ?: null,
                            'next_action_type' => null,
                            'details' => array_filter($details, fn ($v) => $v !== null && $v !== ''),
                        ]);
                        if ($actionAt) {
                            $action->created_at = $actionAt;
                            $action->updated_at = $actionAt;
                        }
                        $action->save();
                    } catch (\Throwable $e) {
                        $warnings[] = [
                            'code' => 'import_comment_failed',
                            'message' => "Failed to store imported comment ({$e->getMessage()}).",
                            'field' => 'comment',
                        ];
                    }
                }

                if ($isCancelStage || $importedOperationalType === 'cancel') {
                    try {
                        $this->createImportedCancelAction(
                            $lead,
                            $operationAt,
                            $lead->assigned_to ?: $uploaderId,
                            $meta,
                            $comment,
                            $cancelReason,
                            $cancelReasonRaw,
                            $importedStageName
                        );
                    } catch (\Throwable $e) {
                        $warnings[] = [
                            'code' => 'import_cancel_failed',
                            'message' => "Failed to store imported cancel action ({$e->getMessage()}).",
                            'field' => 'cancel_reason',
                        ];
                    }
                }

                $rowStatus = $isDuplicateRow ? 'duplicate' : 'success';
                $reasonCode = null;
                $reasonMessage = null;
                if ($rowStatus === 'duplicate') {
                    $reasonCode = $isDbDup ? 'duplicate_existing' : 'duplicate_in_file';
                    $reasonMessage = $isDbDup ? 'Duplicate phone already exists.' : 'Duplicate phone appears multiple times in the same file.';
                }

                if (!empty($warnings)) {
                    $warningRows++;
                }

                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => $rowStatus,
                    'reason_code' => $reasonCode,
                    'reason_message' => $reasonMessage,
                    'raw_data' => $rawRow,
                    'normalized_data' => $normalizedForAudit,
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                    'created_record_id' => $createdId ?: null,
                    'duplicate_of_id' => $duplicateOfId ?: null,
                ]);

                if ($rowStatus === 'duplicate') {
                    $duplicateRows++;
                } else {
                    $successRows++;
                }
            } catch (\Throwable $e) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'failed',
                    'reason_code' => 'exception',
                    'reason_message' => $e->getMessage(),
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalizedForAudit, ['_row' => $e->getMessage()]),
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                    'duplicate_of_id' => $duplicateOfId ?: null,
                ]);
                $failedRows++;
            }
        }

        $job->forceFill([
            'total_rows' => $totalRows,
            'success_rows' => $successRows,
            'failed_rows' => $failedRows,
            'duplicate_rows' => $duplicateRows,
            'skipped_rows' => $skippedRows,
            'warning_rows' => $warningRows,
        ])->save();
    }

    /**
     * @param array<string, mixed> $rawRow
     * @param array<string, string> $mapping
     * @return array<string, mixed>
     */
    private function mapRow(array $rawRow, array $mapping): array
    {
        if (empty($mapping)) {
            $out = $rawRow;
        } else {
            $out = [];
            foreach ($mapping as $fileCol => $targetField) {
                $targetField = trim((string) $targetField);
                if ($targetField === '') {
                    continue;
                }
                if (array_key_exists($fileCol, $rawRow)) {
                    $out[$targetField] = $rawRow[$fileCol];
                }
            }
        }

        foreach ($rawRow as $fileCol => $value) {
            $targetField = $this->inferLeadFieldFromHeader((string) $fileCol);
            if ($targetField && !array_key_exists($targetField, $out)) {
                $out[$targetField] = $value;
            }
        }

        // Preserve pass-through fields if they exist (optional)
        foreach ([
            'stage',
            'status',
            'priority',
            'source',
            'campaign',
            'assigned_to',
            'assignedTo',
            'estimated_value',
            'estimatedValue',
            'notes',
            'note',
            'company',
            'email',
            'phone',
            'other_mobile',
            'otherMobile',
            'name',
            'project',
            'item',
            // Lead creation / action context from the template (optional)
            'creation_date',
            'creationDate',
            'created_at',
            'createdAt',
            'action_date',
            'actionDate',
            'first_action_date',
            'firstActionDate',
            'next_action_date',
            'nextActionDate',
            'next_action_time',
            'nextActionTime',
            'cancel_reason',
            'cancelReason',
            'comment',
            'comments',
            'phone_country',
        ] as $k) {
            if (!array_key_exists($k, $out) && array_key_exists($k, $rawRow)) {
                $out[$k] = $rawRow[$k];
            }
        }

        return $out;
    }

    private function inferLeadFieldFromHeader(string $header): ?string
    {
        $key = $this->normalizeImportHeader($header);

        return match ($key) {
            'creationdate', 'createdat', 'created', 'datecreated',
            'تاريخالإنشاء', 'تاريخالانشاء' => 'creation_date',
            'priority', 'leadpriority', 'الأولوية', 'الاولوية', 'اولوية', 'بريورتي' => 'priority',
            'cancelreason', 'reason', 'reasontext', 'reasontitle', 'سببالالغاء', 'سببالإلغاء' => 'cancel_reason',
            default => null,
        };
    }

    private function normalizeImportHeader(string $header): string
    {
        $normalized = mb_strtolower(trim($header), 'UTF-8');
        return preg_replace('/[\s_\-\/:]+/u', '', $normalized) ?: '';
    }

    private function normalizeLeadPriority($value): string
    {
        $raw = mb_strtolower(trim((string) $value), 'UTF-8');
        $key = preg_replace('/[\s_\-\/:]+/u', '', $raw) ?: '';

        return match ($key) {
            'hot', 'veryhot', 'urgent', 'عاجل', 'ساخن', 'هوت', 'مهمجدا', 'هامجدا' => 'hot',
            'high', 'عالي', 'عالية', 'مرتفع', 'مرتفعة', 'هام', 'هامة', 'مهم', 'مهمة' => 'high',
            'low', 'cold', 'منخفض', 'منخفضة', 'قليل', 'قليلة' => 'low',
            'medium', 'normal', 'متوسط', 'متوسطة', 'عادى', 'عادي', 'طبيعي', 'طبيعية' => 'medium',
            default => in_array($raw, ['hot', 'high', 'medium', 'low'], true) ? $raw : 'medium',
        };
    }

    private function rowNumberFromOptions(array $options, int $index): int
    {
        $start = (int) ($options['row_number_start'] ?? 2); // 2 = after header row by default
        return $start + $index;
    }

    private function storeRow(ImportJob $job, array $attrs): void
    {
        $attrs['job_id'] = $job->id;
        ImportJobRow::create($attrs);
    }

    private function resolveDuplicateRootId(?Lead $lead, ?int $tenantId = null): ?int
    {
        if (!$lead) return null;

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
            if ($tenantId) {
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

    private function findActiveDuplicateLead(?int $tenantId, array $phoneVariants, ?int $duplicateOfId): ?Lead
    {
        if (!$duplicateOfId || empty($phoneVariants)) {
            return null;
        }

        $q = Lead::query()
            ->whereIn('phone', $phoneVariants)
            ->where(function ($w) {
                $w->whereRaw("lower(coalesce(status, '')) = 'duplicate'")
                  ->orWhereRaw("lower(coalesce(stage, '')) = 'duplicate'");
            })
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(20);

        if ($tenantId) {
            $q->where('tenant_id', $tenantId);
        }

        $candidates = $q->get();
        foreach ($candidates as $cand) {
            $meta = is_array($cand->meta_data ?? null) ? ($cand->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (is_numeric($dupOf) && (int) $dupOf === (int) $duplicateOfId) {
                return $cand;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $meta
     * @param array<string, mixed> $attempt
     * @return array<string, mixed>
     */
    private function bumpDuplicateAttemptMeta(array $meta, array $attempt): array
    {
        $count = (int) ($meta['duplicate_attempts_count'] ?? 0);
        $count++;
        $meta['duplicate_attempts_count'] = $count;
        $meta['last_duplicate_at'] = now()->toDateTimeString();

        $attempts = $meta['duplicate_attempts'] ?? null;
        $attempts = is_array($attempts) ? $attempts : [];
        if (!empty($attempt)) {
            $attempts[] = $attempt;
        }
        if (count($attempts) > 20) {
            $attempts = array_slice($attempts, -20);
        }
        $meta['duplicate_attempts'] = $attempts;

        return $meta;
    }

    /**
     * @return array<string, bool>
     */
    private function allowedLeadColumns(): array
    {
        static $cache = null;
        if (is_array($cache)) {
            return $cache;
        }

        try {
            $cols = Schema::getColumnListing('leads');
        } catch (\Throwable $e) {
            $cols = [];
        }

        $out = [];
        foreach ($cols as $c) {
            $out[(string) $c] = true;
        }
        // Also allow meta_data (JSON cast) even if column listing fails.
        $out['meta_data'] = true;
        $out['tenant_id'] = true;
        $cache = $out;
        return $out;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, bool> $allowed
     * @return array<string, mixed>
     */
    private function filterToAllowedColumns(array $data, array $allowed): array
    {
        $out = [];
        foreach ($data as $k => $v) {
            if (isset($allowed[$k])) {
                $out[$k] = $v;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $normalized
     * @param array<string, string> $fieldErrors
     * @return array<string, mixed>
     */
    private function withFieldErrors(array $normalized, array $fieldErrors): array
    {
        if (empty($fieldErrors)) {
            return $normalized;
        }

        $normalized['_field_errors'] = $fieldErrors;
        return $normalized;
    }

    private function parseYmdDate($value): ?\Carbon\Carbon
    {
        if ($value === null || $value === '') return null;
        $raw = trim((string) $value);
        if ($raw === '') return null;
        try {
            if (is_numeric($raw)) {
                $serial = (float) $raw;
                if ($serial > 0 && $serial < 100000) {
                    $days = (int) floor($serial);
                    $seconds = (int) round(($serial - $days) * 86400);
                    return \Carbon\Carbon::create(1899, 12, 30)->addDays($days)->addSeconds($seconds);
                }
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
                return \Carbon\Carbon::createFromFormat('Y-m-d', $raw);
            }
            return \Carbon\Carbon::parse($raw);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function parseImportedNextActionAt($dateValue, $timeValue): ?\Carbon\Carbon
    {
        $dateRaw = trim((string) $dateValue);
        $timeRaw = trim((string) $timeValue);

        if ($dateRaw === '') {
            return null;
        }

        $dateTime = $this->parseYmdDate($dateRaw);
        if ($dateTime) {
            if ($timeRaw !== '' && preg_match('/^\d{1,2}:\d{2}$/', $timeRaw)) {
                [$hours, $minutes] = array_map('intval', explode(':', $timeRaw, 2));
                $dateTime->setTime($hours, $minutes, 0);
            }
            return $dateTime;
        }

        return null;
    }

    private function createOperationalRecordsFromImportedStage(
        Lead $lead,
        ?string $operation,
        \Carbon\Carbon $operationAt,
        ?int $uploaderId,
        bool $isGeneral,
        array $supplementalDetails = []
    ): void {
        if (!$operation) {
            return;
        }

        $actorId = $lead->assigned_to ?: $lead->created_by ?: $uploaderId;
        $meta = [
            'source' => 'excel_import',
            'auto_generated' => true,
            'created_from_stage' => $lead->stage,
            'lead_id' => $lead->id,
        ];

        if (in_array($operation, ['meeting', 'proposal', 'reservation', 'rent', 'follow_up'], true)) {
            $this->createImportedLeadAction($lead, $operation, $operationAt, $actorId, $meta, $supplementalDetails);
        }

        if ($operation === 'reservation') {
            $this->createImportedReservationRecord($lead, $operationAt, $actorId, $meta, $isGeneral);
        }

        if ($operation === 'check_in') {
            $this->createImportedVisit($lead, $operationAt, $actorId, $meta);
        }
    }

    private function createImportedLeadAction(
        Lead $lead,
        string $actionType,
        \Carbon\Carbon $operationAt,
        ?int $actorId,
        array $meta,
        array $supplementalDetails = []
    ): void {
        $importedComment = trim((string) ($supplementalDetails['imported_comment'] ?? ''));
        $description = $importedComment !== '' ? $importedComment : 'Auto-created from imported stage';
        $resolvedActionType = match ($actionType) {
            'meeting'   => 'meeting',
            'proposal'  => 'proposal',
            'reservation' => 'reservation',
            'rent'      => 'rent',
            'follow_up' => 'follow_up',
            default     => 'call',
        };

        $exists = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->where('action_type', $resolvedActionType)
            ->where('description', $description)
            ->exists();

        if ($exists) {
            return;
        }

        $action = new LeadAction([
            'lead_id' => $lead->id,
            'tenant_id' => $lead->tenant_id,
            'user_id' => $actorId,
            'action_type' => $resolvedActionType,
            'description' => $description,
            'stage_id_at_creation' => $lead->stage_id ?: null,
            'next_action_type' => $resolvedActionType,
            'details' => array_filter(array_merge([
                'date' => $operationAt->toDateString(),
                'time' => $operationAt->format('H:i'),
                'status' => 'imported',
                'source' => 'excel_import',
                'auto_generated' => true,
                'created_from_stage' => $lead->stage,
                'imported_stage' => $lead->stage,
                'stage_at_creation_name' => $lead->stage,
                'imported_operational_type' => $actionType,
                'original_action_type' => $actionType,
            ], $supplementalDetails), fn ($value) => $value !== null && $value !== ''),
        ]);
        $action->created_at = $operationAt->copy();
        $action->updated_at = $operationAt->copy();
        $action->save();
    }

    private function createImportedCancelAction(
        Lead $lead,
        \Carbon\Carbon $operationAt,
        ?int $actorId,
        array $meta,
        string $comment,
        ?CancelReason $cancelReason,
        string $cancelReasonRaw,
        string $stageLabel
    ): void {
        $resolvedReasonText = trim((string) ($cancelReason?->title ?: $cancelReasonRaw));
        $resolvedReasonTextAr = trim((string) ($cancelReason?->title_ar ?: ''));
        $description = $comment !== '' ? $comment : ($resolvedReasonText !== '' ? $resolvedReasonText : 'Imported cancel action');

        $exists = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->where('action_type', 'cancel')
            ->where('description', $description)
            ->exists();

        if ($exists) {
            return;
        }

        $details = array_filter(array_merge([
            'date' => $operationAt->toDateString(),
            'time' => $operationAt->format('H:i'),
            'status' => 'cancelled',
            'source' => 'import',
            'auto_generated' => true,
            'imported_stage' => $stageLabel !== '' ? $stageLabel : null,
            'stage_at_creation_name' => $stageLabel !== '' ? $stageLabel : null,
            'cancel_reason_id' => $cancelReason?->id ? (int) $cancelReason->id : null,
            'cancel_reason' => $resolvedReasonText !== '' ? $resolvedReasonText : null,
            'cancel_reason_ar' => $resolvedReasonTextAr !== '' ? $resolvedReasonTextAr : null,
            'comments' => [[
                'kind' => 'cancel_reason',
                'text' => $resolvedReasonText !== '' ? $resolvedReasonText : $cancelReasonRaw,
                'reasonId' => $cancelReason?->id ? (int) $cancelReason->id : null,
                'cancel_reason_id' => $cancelReason?->id ? (int) $cancelReason->id : null,
                'reasonTitle' => $resolvedReasonText !== '' ? $resolvedReasonText : $cancelReasonRaw,
                'reasonTitleAr' => $resolvedReasonTextAr !== '' ? $resolvedReasonTextAr : null,
                'userId' => $lead->assigned_to ?: $actorId,
                'userName' => null,
                'createdAt' => $operationAt->toIso8601String(),
            ]],
        ], $meta), fn ($value) => $value !== null && $value !== '');

        $action = new LeadAction([
            'lead_id' => $lead->id,
            'tenant_id' => $lead->tenant_id,
            'user_id' => $actorId,
            'action_type' => 'cancel',
            'description' => $description,
            'stage_id_at_creation' => $lead->stage_id ?: null,
            'next_action_type' => 'cancel',
            'details' => $details,
        ]);
        $action->created_at = $operationAt->copy();
        $action->updated_at = $operationAt->copy();
        $action->save();
    }

    private function resolveCancelReason(?int $tenantId, string $reasonRaw): ?CancelReason
    {
        $reasonRaw = trim($reasonRaw);
        if ($reasonRaw === '') {
            return null;
        }

        $normalizedRaw = $this->normalizeCancelReasonText($reasonRaw);
        $query = CancelReason::query();
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $reasons = $query->orderBy('id')->get();
        foreach ($reasons as $reason) {
            $title = $this->normalizeCancelReasonText((string) $reason->title);
            $titleAr = $this->normalizeCancelReasonText((string) $reason->title_ar);

            if ($normalizedRaw === $title || $normalizedRaw === $titleAr) {
                return $reason;
            }

            if ($title !== '' && str_starts_with($normalizedRaw, $title)) {
                return $reason;
            }

            if ($titleAr !== '' && str_starts_with($normalizedRaw, $titleAr)) {
                return $reason;
            }
        }

        return null;
    }

    private function normalizeCancelReasonText(string $value): string
    {
        $normalized = mb_strtolower(trim($value), 'UTF-8');
        return preg_replace('/[\s_\-\/:]+/u', '', $normalized) ?: '';
    }

    private function isCancelStageLike(?int $tenantId, string $stageValue, string $fallbackValue = '', ?string $resolvedStageType = null): bool
    {
        $stageType = strtolower(trim((string) ($resolvedStageType ?: $this->resolveStageType($tenantId, $stageValue, $fallbackValue))));
        if ($stageType === 'cancel') {
            return true;
        }

        $candidates = array_filter([
            $stageValue,
            $fallbackValue,
        ], fn ($value) => trim((string) $value) !== '');

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizeCancelReasonText((string) $candidate);
            if (in_array($normalized, [
                'refuse',
                'refused',
                'refusal',
                'rejected',
            ], true)) {
                return true;
            }

            if (in_array($normalized, [
                'cancel',
                'cancellation',
                'cancelled',
                'cancelation',
                'lost',
                'lostdeal',
                'lostdeals',
                'archive',
                'archived',
                'إلغاء',
                'الغاء',
                'خسارة',
            ], true)) {
                return true;
            }

            if (str_starts_with($normalized, 'cancel')) {
                return true;
            }
        }

        return false;
    }

    private function resolveImportedOperationalType(?int $tenantId, string $stageValue, string $fallbackValue = '', ?string $resolvedStageType = null): ?string
    {
        $stageType = strtolower(trim((string) ($resolvedStageType ?: $this->resolveStageType($tenantId, $stageValue, $fallbackValue))));
        $fromType = $this->mapStageTypeToOperationalType($stageType);
        if ($fromType !== null) {
            return $fromType;
        }

        return $this->mapImportedStageToOperationalType($fallbackValue !== '' ? $fallbackValue : $stageValue);
    }

    private function resolveStageType(?int $tenantId, string $stageValue, string $fallbackValue = '', ?string $workflowKey = null): ?string
    {
        if ($workflowKey) {
            $stageRow = $this->resolveWorkflowStage($tenantId, $workflowKey, $stageValue)
                ?: $this->resolveWorkflowStage($tenantId, $workflowKey, $fallbackValue);

            $stageType = trim((string) ($stageRow?->type ?? ''));
            return $stageType !== '' ? $stageType : null;
        }

        if (!$tenantId) {
            return null;
        }

        $stageRow = Stage::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) use ($stageValue, $fallbackValue) {
                $query->where('name', trim($stageValue))
                    ->orWhere('name_ar', trim($stageValue));

                if (trim($fallbackValue) !== '') {
                    $query->orWhere('name', trim($fallbackValue))
                        ->orWhere('name_ar', trim($fallbackValue));
                }
            })
            ->first(['type']);

        $stageType = trim((string) ($stageRow?->type ?? ''));
        return $stageType !== '' ? $stageType : null;
    }

    private function resolveWorkflowEntryStage(?int $tenantId, string $workflowKey): ?Stage
    {
        if (!Schema::hasColumn('stages', 'workflow_key')) {
            return null;
        }

        return Stage::query()
            ->when($tenantId, function ($query) use ($tenantId) {
                $query->where(function ($scoped) use ($tenantId) {
                    $scoped->whereNull('tenant_id')->orWhere('tenant_id', $tenantId);
                });
            })
            ->where('workflow_key', $workflowKey)
            ->where(function ($query) {
                $query->whereNull('is_active')->orWhere('is_active', true);
            })
            ->orderBy('order')
            ->orderBy('id')
            ->first();
    }

    private function resolveWorkflowStage(?int $tenantId, string $workflowKey, string $value): ?Stage
    {
        if (!Schema::hasColumn('stages', 'workflow_key')) {
            return null;
        }

        $raw = trim($value);
        if ($raw === '') {
            return null;
        }

        $normalized = $this->normalizeWorkflowStageValue($raw);

        $stages = Stage::query()
            ->when($tenantId, function ($query) use ($tenantId) {
                $query->where(function ($scoped) use ($tenantId) {
                    $scoped->whereNull('tenant_id')->orWhere('tenant_id', $tenantId);
                });
            })
            ->where('workflow_key', $workflowKey)
            ->orderBy('order')
            ->orderBy('id')
            ->get();

        foreach ($stages as $stage) {
            $candidates = array_filter([
                (string) ($stage->name ?? ''),
                (string) ($stage->name_ar ?? ''),
                (string) ($stage->type ?? ''),
            ], fn ($candidate) => trim((string) $candidate) !== '');

            foreach ($candidates as $candidate) {
                if ($normalized === $this->normalizeWorkflowStageValue((string) $candidate)) {
                    return $stage;
                }
            }
        }

        return null;
    }

    private function normalizeWorkflowStageValue(string $value): string
    {
        $normalized = mb_strtolower(trim($value), 'UTF-8');
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        return preg_replace('/\s+/u', ' ', $normalized) ?: '';
    }

    private function mapStageTypeToOperationalType(?string $stageType): ?string
    {
        $normalized = strtolower(trim((string) $stageType));
        if ($normalized === '') {
            return null;
        }

        return match ($normalized) {
            'meeting' => 'meeting',
            'proposal' => 'proposal',
            'reservation' => 'reservation',
            'rent' => 'rent',
            'follow-up', 'follow up', 'follow_up', 'followup' => 'follow_up',
            'check in', 'check-in', 'check_in', 'checkin' => 'check_in',
            'cancel' => 'cancel',
            default => null,
        };
    }

    private function shouldIgnoreNextActionForStage(?string $stageType, string $stageValue = '', string $fallbackValue = ''): bool
    {
        $normalized = strtolower(trim((string) $stageType));
        if (in_array($normalized, [
            'cancel',
            'closing deals',
            'closing deal',
            'closing_deals',
            'closing-deals',
            'closingdeals',
            'closed deals',
            'closed deal',
            'closed_deals',
            'closed-deals',
            'closeddeals',
        ], true)) {
            return true;
        }

        $fallbackOperation = $this->mapImportedStageToOperationalType($fallbackValue !== '' ? $fallbackValue : $stageValue);
        if ($fallbackOperation === 'cancel') {
            return true;
        }

        $terminalStageNames = [
            'closing deals',
            'closing deal',
            'closingdeals',
            'closed deals',
            'closed deal',
            'closeddeals',
            'closed',
        ];

        foreach ([$stageValue, $fallbackValue] as $candidate) {
            $candidateNormalized = strtolower(trim((string) $candidate));
            if ($candidateNormalized === '') {
                continue;
            }

            $candidateNormalized = str_replace(['_', '-'], ' ', $candidateNormalized);
            $candidateNormalized = preg_replace('/\s+/u', ' ', $candidateNormalized);
            $candidateCompact = str_replace(' ', '', $candidateNormalized);

            if (in_array($candidateNormalized, $terminalStageNames, true) || in_array($candidateCompact, $terminalStageNames, true)) {
                return true;
            }
        }

        return false;
    }

    private function createImportedReservationRecord(
        Lead $lead,
        \Carbon\Carbon $operationAt,
        ?int $actorId,
        array $meta,
        bool $isGeneral
    ): void {
        if ($isGeneral) {
            $exists = InventoryRequest::query()
                ->where('tenant_id', $lead->tenant_id)
                ->where('customer_name', $lead->name)
                ->where('product', (string) ($lead->item ?? $lead->project ?? ''))
                ->whereDate('created_at', $operationAt->toDateString())
                ->exists();

            if ($exists) {
                return;
            }

            $request = InventoryRequest::create([
                'tenant_id' => $lead->tenant_id,
                'customer_name' => $lead->name,
                'property_unit' => null,
                'product' => (string) ($lead->item ?? $lead->project ?? ''),
                'quantity' => 1,
                'status' => 'Imported',
                'priority' => 'Medium',
                'type' => 'Booking',
                'description' => 'Auto-created from imported stage',
                'assigned_to' => (string) ($lead->sales_person ?? ''),
                'payment_plan' => null,
                'source' => $lead->source ?? null,
                'meta_data' => array_merge($meta, [
                    'customer_phone' => $lead->phone,
                    'created_by_id' => $actorId,
                ]),
            ]);

            $request->timestamps = false;
            $request->forceFill([
                'created_at' => $operationAt->copy(),
                'updated_at' => $operationAt->copy(),
            ])->save();
            $request->timestamps = true;

            return;
        }

        $exists = RealEstateRequest::query()
            ->where('tenant_id', $lead->tenant_id)
            ->where('customer_name', $lead->name)
            ->where('project', (string) ($lead->project ?? ''))
            ->whereDate('date', $operationAt->toDateString())
            ->exists();

        if ($exists) {
            return;
        }

        $request = RealEstateRequest::create([
            'tenant_id' => $lead->tenant_id,
            'customer_name' => $lead->name,
            'project' => (string) ($lead->project ?? ''),
            'unit' => '',
            'amount' => 0,
            'status' => 'Imported',
            'type' => 'Booking',
            'date' => $operationAt->toDateString(),
            'notes' => 'Auto-created from imported stage',
            'phone' => $lead->phone,
            'source' => (string) ($lead->source ?? ''),
            'meta_data' => array_merge($meta, [
                'created_by_id' => $actorId,
            ]),
        ]);

        $request->timestamps = false;
        $request->forceFill([
            'created_at' => $operationAt->copy(),
            'updated_at' => $operationAt->copy(),
        ])->save();
        $request->timestamps = true;
    }

    private function createImportedVisit(
        Lead $lead,
        \Carbon\Carbon $operationAt,
        ?int $actorId,
        array $meta
    ): void {
        $exists = Visit::query()
            ->where('lead_id', $lead->id)
            ->where('type', 'lead')
            ->whereDate('check_in_at', $operationAt->toDateString())
            ->exists();

        if ($exists) {
            return;
        }

        $salesPersonName = (string) ($lead->sales_person ?? '');
        if ($salesPersonName === '' && $lead->assigned_to) {
            $assignee = User::query()->find($lead->assigned_to);
            $salesPersonName = (string) ($assignee->name ?? '');
        }

        $visit = Visit::create([
            'tenant_id' => $lead->tenant_id,
            'lead_id' => $lead->id,
            'type' => 'lead',
            'sales_person_id' => $lead->assigned_to ?: $actorId,
            'sales_person_name' => $salesPersonName,
            'customer_name' => $lead->name,
            'check_in_at' => $operationAt->copy(),
            'status' => 'imported',
            'created_by' => $actorId,
            'meta_data' => $meta,
        ]);

        $visit->timestamps = false;
        $visit->forceFill([
            'created_at' => $operationAt->copy(),
            'updated_at' => $operationAt->copy(),
        ])->save();
        $visit->timestamps = true;
    }

    private function mapImportedStageToOperationalType(?string $stage): ?string
    {
        $normalized = strtolower(trim((string) $stage));
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', $normalized);
        $compact = str_replace(' ', '', $normalized);

        $map = [
            'meeting' => 'meeting',
            'اجتماع' => 'meeting',
            'proposal' => 'proposal',
            'عرض' => 'proposal',
            'عرضسعر' => 'proposal',
            'reservation' => 'reservation',
            'حجز' => 'reservation',
            'rent' => 'rent',
            'ايجار' => 'rent',
            'إيجار' => 'rent',
            'followup' => 'follow_up',
            'follow up' => 'follow_up',
            'متابعة' => 'follow_up',
            'checkin' => 'check_in',
            'check in' => 'check_in',
            'تشيكان' => 'check_in',
            'تشيكإن' => 'check_in',
            'تشيك ان' => 'check_in',
        ];

        if (in_array($normalized, ['cancel', 'cancelled', 'canceled', 'cancellation', 'refuse', 'refused', 'refusal', 'rejected'], true)) {
            return 'cancel';
        }

        if (in_array($compact, ['cancel', 'cancelled', 'canceled', 'cancellation', 'refuse', 'refused', 'refusal', 'rejected'], true)) {
            return 'cancel';
        }

        return $map[$normalized] ?? $map[$compact] ?? null;
    }
}
