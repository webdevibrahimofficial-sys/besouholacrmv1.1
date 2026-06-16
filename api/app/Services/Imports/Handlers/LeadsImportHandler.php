<?php

namespace App\Services\Imports\Handlers;

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
use App\Support\PhoneNormalizer;
use App\Support\TenantSourceLookup;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class LeadsImportHandler implements ImportHandler
{
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
        $availableStages = [];
        if ($tenantId) {
            $stageRows = Stage::query()
                ->where('tenant_id', $tenantId)
                ->get(['name', 'name_ar']);

            foreach ($stageRows as $stageRow) {
                $canonicalStage = trim((string) ($stageRow->name ?? $stageRow->name_ar ?? ''));
                if ($canonicalStage === '') {
                    continue;
                }

                foreach ([(string) ($stageRow->name ?? ''), (string) ($stageRow->name_ar ?? '')] as $stageAlias) {
                    $stageAlias = trim($stageAlias);
                    if ($stageAlias === '') {
                        continue;
                    }

                    $availableStages[strtolower(str_replace([' ', '-'], '', $stageAlias))] = $canonicalStage;
                }
            }
        }

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

            // Extract optional fields we may use after create.
            $assignedToRaw = trim((string) ($normalized['assignedTo'] ?? $normalized['assigned_to'] ?? ''));
            $nextActionDate = trim((string) ($normalized['next_action_date'] ?? $normalized['nextActionDate'] ?? ''));
            $nextActionTime = trim((string) ($normalized['next_action_time'] ?? $normalized['nextActionTime'] ?? ''));
            $creationDateRaw = trim((string) ($normalized['creation_date'] ?? $normalized['creationDate'] ?? $normalized['created_at'] ?? $normalized['createdAt'] ?? ''));
            $firstActionDateRaw = trim((string) ($normalized['first_action_date'] ?? $normalized['firstActionDate'] ?? $normalized['last_action_date'] ?? $normalized['lastActionDate'] ?? $normalized['action_date'] ?? $normalized['actionDate'] ?? ''));
            $comment = trim((string) ($normalized['comment'] ?? $normalized['comments'] ?? ''));
            $phoneCountry = trim((string) ($normalized['phone_country'] ?? ''));

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

            // Stage normalization (match legacy behavior)
            $incomingStage = trim((string) ($normalized['stage'] ?? ''));
            if ($incomingStage === '') {
                $normalized['stage'] = 'New Lead';
            } else {
                $normIncoming = strtolower(str_replace([' ', '-'], '', $incomingStage));
                if (in_array($normIncoming, ['new', 'newlead', 'fresh'], true)) {
                    $normalized['stage'] = 'New Lead';
                } elseif ($normIncoming === 'pending') {
                    $normalized['stage'] = 'Pending';
                } elseif (in_array($normIncoming, ['coldcalls', 'coldcall'], true)) {
                    $normalized['stage'] = 'Cold Calls';
                } elseif ($normIncoming === 'duplicate') {
                    $normalized['stage'] = 'Duplicate';
                } elseif (in_array($normIncoming, ['reseal', 'resale'], true)) {
                    $normalized['stage'] = 'Resale';
                } else {
                    $normalized['stage'] = $incomingStage;
                }
            }

            $stageLabel = trim((string) ($normalized['stage'] ?? ''));
            $stageKey = strtolower(str_replace([' ', '-'], '', $stageLabel));
            if ($stageKey === '' || !isset($availableStages[$stageKey])) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => 'stage_not_found',
                    'reason_message' => "Stage '{$stageLabel}' not found in stages table. Row skipped.",
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, ['stage' => "Stage '{$stageLabel}' not found in stages table."]),
                    'warnings' => $warnings,
                    'entity_type' => 'leads',
                ]);
                $skippedRows++;
                continue;
            }

            $normalized['stage'] = $availableStages[$stageKey];

            // Store common template fields inside meta_data (best-effort).
            $meta = is_array($normalized['meta_data'] ?? null) ? ($normalized['meta_data'] ?? []) : [];
            if ($phoneCountry !== '') {
                $meta['phone_country'] = $phoneCountry;
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
                if ($tenantId) {
                    $base->where('tenant_id', $tenantId);
                }
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

                $importedOperationalType = $this->mapImportedStageToOperationalType((string) ($normalized['stage'] ?? ''));
                $shouldCollapseIntoOperationalAction = in_array($importedOperationalType, ['meeting', 'proposal', 'reservation', 'rent', 'follow_up'], true);

                $operationAt = $firstActionDate
                    ?: $nextActionAt
                    ?: $creationDate
                    ?: now();

                $this->createOperationalRecordsFromImportedStage(
                    $lead,
                    (string) ($normalized['stage'] ?? ''),
                    $operationAt,
                    $uploaderId,
                    $isGeneral,
                    array_filter([
                        'imported_comment' => $comment !== '' ? $comment : null,
                        'imported_next_action_date' => $nextActionAt?->toDateString(),
                        'imported_next_action_time' => $nextActionAt?->format('H:i'),
                    ], fn ($value) => $value !== null && $value !== '')
                );

                $importedStageName = trim((string) ($normalized['stage'] ?? ''));

                // Next action creation (optional, best-effort).
                // If the row already contains a comment, collapse both into one action
                // so the timeline shows a single actionable record instead of Call + Comment.
                if ($nextActionAt && !$shouldCollapseIntoOperationalAction) {
                    $time = $nextActionAt->format('H:i');
                    try {
                        LeadAction::create([
                            'lead_id' => $lead->id,
                            'tenant_id' => $tenantId,
                            'user_id' => $lead->assigned_to ?: $uploaderId,
                            'action_type' => 'call',
                            'description' => $comment !== '' ? $comment : 'Imported next action',
                            'stage_id_at_creation' => null,
                            'next_action_type' => 'call',
                            'details' => array_filter([
                                'date' => $nextActionAt->toDateString(),
                                'time' => $time,
                                'status' => 'scheduled',
                                'source' => 'import',
                                'priority' => $lead->priority ?? 'medium',
                                'imported_stage' => $importedStageName !== '' ? $importedStageName : null,
                                'stage_at_creation_name' => $importedStageName !== '' ? $importedStageName : null,
                            ], fn ($v) => $v !== null && $v !== ''),
                        ]);
                    } catch (\Throwable $e) {
                        $warnings[] = ['code' => 'next_action_failed', 'message' => "Failed to create next action ({$e->getMessage()}).", 'field' => 'next_action_date'];
                    }
                }

                // Import comments -> record as an action (so it appears in Last Comment + Actions timeline).
                // If an Action Date is provided in the sheet, use it as the action "performed at" date (and created_at)
                // so that it counts as an action performed on that date.
                if ($comment !== '' && !$shouldCollapseIntoOperationalAction && !$nextActionAt) {
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
                            'stage_id_at_creation' => null,
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
                    'normalized_data' => $normalized,
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
                    'normalized_data' => $this->withFieldErrors($normalized, ['_row' => $e->getMessage()]),
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
            return $rawRow;
        }

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
        ?string $stage,
        \Carbon\Carbon $operationAt,
        ?int $uploaderId,
        bool $isGeneral,
        array $supplementalDetails = []
    ): void {
        $operation = $this->mapImportedStageToOperationalType($stage);
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

        $exists = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->where('action_type', $actionType)
            ->where('description', $description)
            ->exists();

        if ($exists) {
            return;
        }

        $action = new LeadAction([
            'lead_id' => $lead->id,
            'tenant_id' => $lead->tenant_id,
            'user_id' => $actorId,
            'action_type' => $actionType,
            'description' => $description,
            'stage_id_at_creation' => null,
            'next_action_type' => null,
            'details' => array_filter(array_merge([
                'date' => $operationAt->toDateString(),
                'time' => $operationAt->format('H:i'),
                'status' => 'imported',
                'source' => 'excel_import',
                'auto_generated' => true,
                'created_from_stage' => $lead->stage,
            ], $supplementalDetails), fn ($value) => $value !== null && $value !== ''),
        ]);
        $action->created_at = $operationAt->copy();
        $action->updated_at = $operationAt->copy();
        $action->save();
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

        return $map[$normalized] ?? $map[$compact] ?? null;
    }
}
