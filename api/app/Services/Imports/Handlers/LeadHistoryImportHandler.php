<?php

namespace App\Services\Imports\Handlers;

use App\Models\ImportJob;
use App\Models\ImportJobRow;
use App\Models\InventoryRequest;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\RealEstateRequest;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Visit;
use App\Services\Imports\Contracts\ImportHandler;
use App\Support\PhoneNormalizer;
use Carbon\Carbon;

class LeadHistoryImportHandler implements ImportHandler
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
        $isGeneral = $this->isGeneralTenant($tenantId);

        $totalRows = 0;
        $successRows = 0;
        $failedRows = 0;
        $duplicateRows = 0;
        $skippedRows = 0;
        $warningRows = 0;

        $contextName = null;
        $contextPhone = null;
        $contextPhoneCountry = $phoneCountryHint;

        foreach ($rows as $index => $rawRow) {
            $rowNumber = $this->rowNumberFromOptions($options, $index);
            $warnings = [];
            $totalRows++;

            if (!is_array($rawRow)) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'failed',
                    'reason_code' => 'invalid_row',
                    'reason_message' => 'Row is not an object.',
                    'raw_data' => $rawRow,
                    'normalized_data' => null,
                    'warnings' => [],
                    'entity_type' => 'lead_history',
                ]);
                $failedRows++;
                continue;
            }

            $normalized = $this->mapRow($rawRow, $mapping);

            $name = trim((string) ($normalized['name'] ?? ''));
            $phoneRaw = $this->stringifyPhoneValue($normalized['phone'] ?? null);
            $phoneCountry = trim((string) ($normalized['phone_country'] ?? $contextPhoneCountry ?? ''));

            if ($name !== '') {
                $contextName = $name;
            } elseif ($contextName !== null) {
                $normalized['name'] = $contextName;
                $name = $contextName;
            }

            if ($phoneRaw !== '') {
                $contextPhone = $phoneRaw;
                if ($phoneCountry !== '') {
                    $contextPhoneCountry = $phoneCountry;
                }
            } elseif ($contextPhone !== null) {
                $normalized['phone'] = $contextPhone;
                $phoneRaw = $contextPhone;
                if ($contextPhoneCountry !== null && $contextPhoneCountry !== '') {
                    $normalized['phone_country'] = $contextPhoneCountry;
                    $phoneCountry = $contextPhoneCountry;
                }
            }

            $normalizedPhone = $phoneRaw !== '' ? PhoneNormalizer::normalize($phoneRaw, $phoneCountry !== '' ? $phoneCountry : null) : '';
            if ($normalizedPhone !== '') {
                $normalized['phone'] = $normalizedPhone;
            }

            $stageRaw = trim((string) ($normalized['stage'] ?? ''));
            $actionTypeRaw = trim((string) ($normalized['action_type'] ?? $normalized['actionType'] ?? $normalized['type'] ?? ''));
            $comment = trim((string) ($normalized['comment'] ?? ''));
            $salesRepRaw = trim((string) ($normalized['assigned_to'] ?? $normalized['sales_rep'] ?? ''));
            $actionAt = $this->parseActionAt(
                $normalized['action_at'] ?? $normalized['follow_date'] ?? $normalized['date'] ?? null
            );

            $hasActionPayload = $stageRaw !== '' || $actionTypeRaw !== '' || $comment !== '' || $salesRepRaw !== '' || $actionAt !== null;
            if (!$hasActionPayload) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => 'context_row',
                    'reason_message' => 'Context-only row detected. No history action created.',
                    'raw_data' => $rawRow,
                    'normalized_data' => $normalized,
                    'warnings' => [],
                    'entity_type' => 'lead_history',
                ]);
                $skippedRows++;
                continue;
            }

            if (($name === '' || $normalizedPhone === '') && !($name !== '' || $normalizedPhone !== '')) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => 'missing_match_fields',
                    'reason_message' => 'Lead name or phone is required to match an existing lead.',
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, [
                        'name' => 'Lead name or phone is required.',
                        'phone' => 'Lead name or phone is required.',
                    ]),
                    'warnings' => [],
                    'entity_type' => 'lead_history',
                ]);
                $skippedRows++;
                continue;
            }

            $leadMatch = $this->resolveLead($tenantId, $normalizedPhone, $name, $phoneCountry);
            if (!$leadMatch['lead']) {
                $reasonCode = $leadMatch['reason_code'] ?? 'lead_not_found';
                $reasonMessage = $leadMatch['reason_message'] ?? 'Matching lead not found.';
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'skipped',
                    'reason_code' => $reasonCode,
                    'reason_message' => $reasonMessage,
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, [
                        'phone' => $reasonMessage,
                    ]),
                    'warnings' => [],
                    'entity_type' => 'lead_history',
                ]);
                $skippedRows++;
                continue;
            }

            /** @var Lead $lead */
            $lead = $leadMatch['lead'];
            if (!empty($leadMatch['warning'])) {
                $warnings[] = [
                    'code' => 'lead_match_warning',
                    'message' => (string) $leadMatch['warning'],
                    'field' => 'phone',
                ];
            }

            if ($actionAt === null) {
                $actionAt = now();
                $warnings[] = [
                    'code' => 'missing_action_date',
                    'message' => 'History row has no valid date. Using import time.',
                    'field' => 'action_at',
                ];
            }

            $userResolution = $this->resolveActionUser($tenantId, $lead, $salesRepRaw, $uploaderId);
            $actionUserId = $userResolution['user_id'];
            if (!empty($userResolution['warning'])) {
                $warnings[] = [
                    'code' => 'sales_rep_resolution',
                    'message' => (string) $userResolution['warning'],
                    'field' => 'assigned_to',
                ];
            }

            $stageMeta = $this->mapHistoryStage($stageRaw);
            $stageMeta['action_type'] = $this->resolveHistoryActionType($actionTypeRaw, (string) ($stageMeta['action_type'] ?? ''));
            $fingerprint = $this->historyFingerprint($lead, $stageRaw, $actionAt, $salesRepRaw, $comment);

            try {
                $createdAction = $this->createHistoryAction(
                    $lead,
                    $stageMeta,
                    $stageRaw,
                    $comment,
                    $actionAt,
                    $actionUserId,
                    $salesRepRaw,
                    $fingerprint,
                    $job
                );

                if (!$createdAction) {
                    $this->storeRow($job, [
                        'row_number' => $rowNumber,
                        'status' => 'duplicate',
                        'reason_code' => 'duplicate_history_entry',
                        'reason_message' => 'Equivalent history entry already exists for this lead.',
                        'raw_data' => $rawRow,
                        'normalized_data' => $normalized,
                        'warnings' => $warnings,
                        'entity_type' => 'lead_history',
                        'duplicate_of_id' => $lead->id,
                    ]);
                    $duplicateRows++;
                    if (!empty($warnings)) {
                        $warningRows++;
                    }
                    continue;
                }

                if (($stageMeta['operation'] ?? null) === 'reservation') {
                    $this->createImportedReservationRecord(
                        $lead,
                        $actionAt,
                        $actionUserId,
                        $this->buildOperationalMeta($lead, $job, $stageRaw, $comment, $salesRepRaw, $fingerprint),
                        $isGeneral
                    );
                }

                if (($stageMeta['operation'] ?? null) === 'check_in') {
                    $this->createImportedVisit(
                        $lead,
                        $actionAt,
                        $actionUserId,
                        $this->buildOperationalMeta($lead, $job, $stageRaw, $comment, $salesRepRaw, $fingerprint)
                    );
                }

                if (!empty($warnings)) {
                    $warningRows++;
                }

                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'success',
                    'reason_code' => null,
                    'reason_message' => null,
                    'raw_data' => $rawRow,
                    'normalized_data' => $normalized,
                    'warnings' => $warnings,
                    'entity_type' => 'lead_history',
                    'created_record_id' => $createdAction->id,
                    'duplicate_of_id' => $lead->id,
                ]);
                $successRows++;
            } catch (\Throwable $e) {
                $this->storeRow($job, [
                    'row_number' => $rowNumber,
                    'status' => 'failed',
                    'reason_code' => 'exception',
                    'reason_message' => $e->getMessage(),
                    'raw_data' => $rawRow,
                    'normalized_data' => $this->withFieldErrors($normalized, ['_row' => $e->getMessage()]),
                    'warnings' => $warnings,
                    'entity_type' => 'lead_history',
                    'duplicate_of_id' => $lead->id,
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
            $targetField = $this->inferHistoryFieldFromHeader((string) $fileCol);
            if ($targetField && !array_key_exists($targetField, $out)) {
                $out[$targetField] = $value;
            }
        }

        foreach ([
            'name',
            'phone',
            'phone_country',
            'stage',
            'action_type',
            'actionType',
            'type',
            'action_at',
            'follow_date',
            'date',
            'assigned_to',
            'sales_rep',
            'sales_person',
            'comment',
            'notes',
        ] as $k) {
            if (!array_key_exists($k, $out) && array_key_exists($k, $rawRow)) {
                $out[$k] = $rawRow[$k];
            }
        }

        return $out;
    }

    private function inferHistoryFieldFromHeader(string $header): ?string
    {
        $key = $this->normalizeHistoryHeader($header);

        return match ($key) {
            'actiontype', 'type', 'نوعالاكشن', 'نوعالإجراء', 'الإجراء', 'الاجراء' => 'action_type',
            default => null,
        };
    }

    private function normalizeHistoryHeader(string $header): string
    {
        $normalized = mb_strtolower(trim($header), 'UTF-8');
        return preg_replace('/[\s_\-\/:]+/u', '', $normalized) ?: '';
    }

    private function rowNumberFromOptions(array $options, int $index): int
    {
        $start = (int) ($options['row_number_start'] ?? 2);
        return $start + $index;
    }

    private function storeRow(ImportJob $job, array $attrs): void
    {
        $attrs['job_id'] = $job->id;
        ImportJobRow::create($attrs);
    }

    /**
     * @param array<string, mixed> $normalized
     * @param array<string, string> $fieldErrors
     * @return array<string, mixed>
     */
    private function withFieldErrors(array $normalized, array $fieldErrors): array
    {
        if (!empty($fieldErrors)) {
            $normalized['_field_errors'] = $fieldErrors;
        }

        return $normalized;
    }

    private function stringifyPhoneValue(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_int($value) || is_float($value)) {
            $formatted = sprintf('%.0f', (float) $value);
            return trim($formatted);
        }

        $stringValue = trim((string) $value);
        if ($stringValue !== '' && preg_match('/^[0-9]+(?:\.[0-9]+)?e\+[0-9]+$/i', $stringValue)) {
            return sprintf('%.0f', (float) $stringValue);
        }

        return $stringValue;
    }

    /**
     * @return array{lead:?Lead,reason_code?:string,reason_message?:string,warning?:string}
     */
    private function resolveLead(?int $tenantId, string $normalizedPhone, string $name, ?string $phoneCountry): array
    {
        $query = Lead::query();
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($normalizedPhone !== '') {
            $variants = PhoneNormalizer::variantsForSearch($normalizedPhone, $phoneCountry);
            $candidates = (clone $query)
                ->whereIn('phone', $variants)
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
                ->get();

            if ($candidates->count() === 1) {
                return ['lead' => $candidates->first()];
            }

            if ($candidates->count() > 1 && $name !== '') {
                $matchedByName = $candidates->first(function (Lead $lead) use ($name) {
                    return mb_strtolower(trim((string) $lead->name)) === mb_strtolower(trim($name));
                });
                if ($matchedByName) {
                    return [
                        'lead' => $matchedByName,
                        'warning' => 'Multiple phone matches found. Name was used to pick the correct lead.',
                    ];
                }

                return [
                    'lead' => null,
                    'reason_code' => 'ambiguous_lead_match',
                    'reason_message' => 'Multiple leads match this phone and none matches the provided name exactly.',
                ];
            }

            if ($candidates->count() > 1) {
                return [
                    'lead' => null,
                    'reason_code' => 'ambiguous_lead_match',
                    'reason_message' => 'Multiple leads match this phone. Please include the exact client name.',
                ];
            }
        }

        if ($name !== '') {
            $byName = (clone $query)
                ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($name))])
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
                ->get();

            if ($byName->count() === 1) {
                return [
                    'lead' => $byName->first(),
                    'warning' => 'Lead matched by exact name because phone was missing or unmatched.',
                ];
            }

            if ($byName->count() > 1) {
                return [
                    'lead' => null,
                    'reason_code' => 'ambiguous_lead_match',
                    'reason_message' => 'Multiple leads share this client name. Please include the phone number.',
                ];
            }
        }

        return [
            'lead' => null,
            'reason_code' => 'lead_not_found',
            'reason_message' => 'No lead matched the provided phone/name within this tenant.',
        ];
    }

    /**
     * @return array{user_id:?int,warning?:string}
     */
    private function resolveActionUser(?int $tenantId, Lead $lead, string $salesRepRaw, ?int $fallbackUserId): array
    {
        $fallback = $lead->assigned_to ?: $lead->created_by ?: $fallbackUserId;
        if ($salesRepRaw === '') {
            return ['user_id' => $fallback];
        }

        if (ctype_digit($salesRepRaw)) {
            $user = User::query()
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->where('id', (int) $salesRepRaw)
                ->first();

            if ($user) {
                return ['user_id' => (int) $user->id];
            }

            return [
                'user_id' => $fallback,
                'warning' => "Sales rep '{$salesRepRaw}' was not found. Fallback user was used.",
            ];
        }

        $lookup = trim($salesRepRaw);
        $users = User::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where(function ($q) use ($lookup) {
                $q->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($lookup)])
                    ->orWhereRaw('LOWER(TRIM(email)) = ?', [mb_strtolower($lookup)]);
            })
            ->orderBy('id')
            ->limit(2)
            ->get();

        if ($users->count() === 1) {
            return ['user_id' => (int) $users->first()->id];
        }

        if ($users->count() > 1) {
            return [
                'user_id' => $fallback,
                'warning' => "Sales rep '{$salesRepRaw}' matched multiple users. Fallback user was used.",
            ];
        }

        return [
            'user_id' => $fallback,
            'warning' => "Sales rep '{$salesRepRaw}' was not found. Fallback user was used.",
        ];
    }

    /**
     * @return array{action_type:string,operation:?string,details:array<string,mixed>}
     */
    private function mapHistoryStage(?string $stageRaw): array
    {
        $normalized = mb_strtolower(trim((string) $stageRaw));
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?: $normalized;
        $compact = str_replace(' ', '', $normalized);

        $map = [
            'meeting' => ['action_type' => 'meeting', 'operation' => 'meeting', 'details' => ['meeting_status' => 'done']],
            'proposal' => ['action_type' => 'proposal', 'operation' => 'proposal', 'details' => []],
            'reservation' => ['action_type' => 'reservation', 'operation' => 'reservation', 'details' => []],
            'rent' => ['action_type' => 'rent', 'operation' => 'rent', 'details' => []],
            'follow up' => ['action_type' => 'follow_up', 'operation' => 'follow_up', 'details' => []],
            'followup' => ['action_type' => 'follow_up', 'operation' => 'follow_up', 'details' => []],
            'no answer' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'no_answer']],
            'noanswer' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'no_answer']],
            'not interested' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'not_interested']],
            'notinterested' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'not_interested']],
            'cancellation' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'cancelation' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'cancelled' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'cancel' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'rotation' => ['action_type' => 'rotation', 'operation' => null, 'details' => ['rotation_status' => 'rotated']],
            'check in' => ['action_type' => 'check_in', 'operation' => 'check_in', 'details' => []],
            'checkin' => ['action_type' => 'check_in', 'operation' => 'check_in', 'details' => []],
            'visit' => ['action_type' => 'check_in', 'operation' => 'check_in', 'details' => []],
            'اجتماع' => ['action_type' => 'meeting', 'operation' => 'meeting', 'details' => ['meeting_status' => 'done']],
            'عرض سعر' => ['action_type' => 'proposal', 'operation' => 'proposal', 'details' => []],
            'حجز' => ['action_type' => 'reservation', 'operation' => 'reservation', 'details' => []],
            'متابعة' => ['action_type' => 'follow_up', 'operation' => 'follow_up', 'details' => []],
            'لا رد' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'no_answer']],
            'غير مهتم' => ['action_type' => 'call', 'operation' => null, 'details' => ['call_status' => 'not_interested']],
            'إلغاء' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'الغاء' => ['action_type' => 'cancel', 'operation' => null, 'details' => ['cancel_status' => 'cancelled']],
            'تدوير' => ['action_type' => 'rotation', 'operation' => null, 'details' => ['rotation_status' => 'rotated']],
            'تشيك ان' => ['action_type' => 'check_in', 'operation' => 'check_in', 'details' => []],
        ];

        if (isset($map[$normalized])) {
            return $map[$normalized];
        }

        if (isset($map[$compact])) {
            return $map[$compact];
        }

        return [
            'action_type' => 'call',
            'operation' => null,
            'details' => [],
        ];
    }

    private function resolveHistoryActionType(string $actionTypeRaw, string $mappedActionType): string
    {
        $normalized = mb_strtolower(trim($actionTypeRaw), 'UTF-8');
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?: $normalized;
        $compact = str_replace(' ', '', $normalized);

        $map = [
            'call' => 'call',
            'phone call' => 'call',
            'phonecall' => 'call',
            'مكالمة' => 'call',
            'اتصال' => 'call',
            'meeting' => 'meeting',
            'اجتماع' => 'meeting',
            'proposal' => 'proposal',
            'عرض سعر' => 'proposal',
            'reservation' => 'reservation',
            'حجز' => 'reservation',
            'rent' => 'rent',
            'follow up' => 'follow_up',
            'followup' => 'follow_up',
            'متابعة' => 'follow_up',
            'cancel' => 'cancel',
            'cancellation' => 'cancel',
            'cancelation' => 'cancel',
            'cancelled' => 'cancel',
            'إلغاء' => 'cancel',
            'الغاء' => 'cancel',
            'rotation' => 'rotation',
            'تدوير' => 'rotation',
            'check in' => 'check_in',
            'checkin' => 'check_in',
            'visit' => 'check_in',
            'تشيك ان' => 'check_in',
            'note' => 'note',
            'comment' => 'comment',
        ];

        if ($normalized !== '') {
            return $map[$normalized] ?? $map[$compact] ?? 'call';
        }

        $mappedActionType = trim($mappedActionType);
        return $mappedActionType !== '' ? $mappedActionType : 'call';
    }

    private function historyFingerprint(
        Lead $lead,
        string $stageRaw,
        Carbon $actionAt,
        string $salesRepRaw,
        string $comment
    ): string {
        return sha1(json_encode([
            'lead_id' => (int) $lead->id,
            'stage' => mb_strtolower(trim($stageRaw)),
            'action_at' => $actionAt->format('Y-m-d H:i:s'),
            'sales_rep' => mb_strtolower(trim($salesRepRaw)),
            'comment' => trim($comment),
        ], JSON_UNESCAPED_UNICODE));
    }

    private function createHistoryAction(
        Lead $lead,
        array $stageMeta,
        string $stageRaw,
        string $comment,
        Carbon $actionAt,
        ?int $actionUserId,
        string $salesRepRaw,
        string $fingerprint,
        ImportJob $job
    ): ?LeadAction {
        $exists = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->where('details->history_fingerprint', $fingerprint)
            ->exists();

        if ($exists) {
            return null;
        }

        $description = $comment !== '' ? $comment : $this->fallbackDescription($stageRaw);
        $details = array_filter(array_merge([
            'date' => $actionAt->toDateString(),
            'time' => $actionAt->format('H:i'),
            'source' => 'history_import',
            'import_job_id' => (int) $job->id,
            'imported_stage' => $stageRaw !== '' ? $stageRaw : null,
            'history_fingerprint' => $fingerprint,
            'auto_generated' => true,
            'sales_rep_name' => $salesRepRaw !== '' ? $salesRepRaw : null,
        ], is_array($stageMeta['details'] ?? null) ? $stageMeta['details'] : []), fn ($value) => $value !== null && $value !== '');

        $action = new LeadAction([
            'lead_id' => $lead->id,
            'tenant_id' => $lead->tenant_id,
            'user_id' => $actionUserId,
            'action_type' => (string) ($stageMeta['action_type'] ?? 'comment'),
            'description' => $description,
            'stage_id_at_creation' => null,
            'next_action_type' => null,
            'details' => $details,
        ]);
        $action->created_at = $actionAt->copy();
        $action->updated_at = $actionAt->copy();
        $action->save();

        return $action;
    }

    private function fallbackDescription(string $stageRaw): string
    {
        $stageRaw = trim($stageRaw);
        if ($stageRaw === '') {
            return 'Imported history entry';
        }

        return "Imported {$stageRaw} history";
    }

    /**
     * @return array<string, mixed>
     */
    private function buildOperationalMeta(
        Lead $lead,
        ImportJob $job,
        string $stageRaw,
        string $comment,
        string $salesRepRaw,
        string $fingerprint
    ): array {
        return array_filter([
            'source' => 'history_import',
            'auto_generated' => true,
            'lead_id' => $lead->id,
            'import_job_id' => (int) $job->id,
            'imported_stage' => $stageRaw !== '' ? $stageRaw : null,
            'imported_comment' => $comment !== '' ? $comment : null,
            'sales_rep_name' => $salesRepRaw !== '' ? $salesRepRaw : null,
            'history_fingerprint' => $fingerprint,
        ], fn ($value) => $value !== null && $value !== '');
    }

    private function createImportedReservationRecord(
        Lead $lead,
        Carbon $operationAt,
        ?int $actorId,
        array $meta,
        bool $isGeneral
    ): void {
        if ($isGeneral) {
            $exists = InventoryRequest::query()
                ->where('tenant_id', $lead->tenant_id)
                ->where('meta_data->history_fingerprint', $meta['history_fingerprint'] ?? '')
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
                'description' => 'Imported from lead history',
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
            ->where('meta_data->history_fingerprint', $meta['history_fingerprint'] ?? '')
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
            'notes' => 'Imported from lead history',
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
        Carbon $operationAt,
        ?int $actorId,
        array $meta
    ): void {
        $exists = Visit::query()
            ->where('lead_id', $lead->id)
            ->where('meta_data->history_fingerprint', $meta['history_fingerprint'] ?? '')
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

    private function parseActionAt(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            $numeric = (float) $value;
            if ($numeric > 20000 && $numeric < 100000) {
                try {
                    return Carbon::create(1899, 12, 30, 0, 0, 0)->addDays((int) floor($numeric))->addSeconds((int) round(($numeric - floor($numeric)) * 86400));
                } catch (\Throwable) {
                    return null;
                }
            }
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        try {
            return Carbon::parse($raw);
        } catch (\Throwable) {
            return null;
        }
    }

    private function isGeneralTenant(?int $tenantId): bool
    {
        if (!$tenantId) {
            return false;
        }

        try {
            $tenant = Tenant::find($tenantId);
            return strtolower((string) ($tenant?->company_type ?? '')) === 'general';
        } catch (\Throwable) {
            return false;
        }
    }
}
