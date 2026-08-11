<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappContact;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappUnassignedContact;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Resolve WhatsApp LID identifiers (14+ digit / @lid) into real phone numbers
 * via the connected Mirror session, then persist the mapping everywhere the
 * inbox and contact layers read from.
 */
class WhatsappLidResolutionService
{
    public function __construct(
        private readonly WhatsappMirrorClient $mirrorClient,
        private readonly WhatsappContactStoreService $contactStore,
        private readonly WhatsappGroupContactService $groupContactService,
    ) {
    }

    /**
     * @param  array<int, string>|null  $explicitLids
     * @return array{
     *   attempted: int,
     *   resolved: int,
     *   unresolved: int,
     *   contacts_updated: int,
     *   unassigned_updated: int,
     *   group_contacts_updated: int,
     *   messages_updated: int,
     *   resolved_map: array<string, string>,
     *   skipped_reason: string|null
     * }
     */
    public function resolveForTenant(int $tenantId, ?array $explicitLids = null): array
    {
        $empty = [
            'attempted' => 0,
            'resolved' => 0,
            'unresolved' => 0,
            'contacts_updated' => 0,
            'unassigned_updated' => 0,
            'group_contacts_updated' => 0,
            'messages_updated' => 0,
            'resolved_map' => [],
            'skipped_reason' => null,
        ];

        if ($tenantId <= 0) {
            $empty['skipped_reason'] = 'invalid_tenant';
            return $empty;
        }

        $session = WhatsappMirrorSession::query()->where('tenant_id', $tenantId)->first();
        if (!$session || $session->status !== 'connected') {
            $empty['skipped_reason'] = 'mirror_not_connected';
            return $empty;
        }

        $lids = $explicitLids !== null
            ? $this->normalizeLidList($explicitLids)
            : $this->collectUnresolvedLids($tenantId);

        if (empty($lids)) {
            $empty['skipped_reason'] = 'nothing_to_resolve';
            return $empty;
        }

        // First: local healing from contact store / message history without
        // calling WhatsApp (covers phones we already knew but never linked).
        $locallyResolved = [];
        foreach ($lids as $lid) {
            $phone = $this->contactStore->resolvePhoneForLid($tenantId, $lid)
                ?: $this->contactStore->resolveFromMessageHistory($tenantId, $lid);

            if ($phone && !$this->looksLikeLid($phone) && $phone !== $lid) {
                $locallyResolved[$lid] = $phone;
            }
        }

        $needsLiveLookup = array_values(array_diff($lids, array_keys($locallyResolved)));
        $liveResolved = [];

        if (!empty($needsLiveLookup)) {
            try {
                $response = $this->mirrorClient->resolveLids($tenantId, $needsLiveLookup);
            } catch (Throwable $e) {
                Log::error('[WhatsApp LID Resolve] mirror request failed', [
                    'tenant_id' => $tenantId,
                    'error' => $e->getMessage(),
                ]);

                // Still apply whatever we healed locally.
                $applied = $this->applyResolvedMap($tenantId, $locallyResolved);
                return array_merge($empty, $applied, [
                    'attempted' => count($lids),
                    'resolved' => count($locallyResolved),
                    'unresolved' => count($lids) - count($locallyResolved),
                    'resolved_map' => $locallyResolved,
                    'skipped_reason' => 'mirror_request_failed',
                ]);
            }

            if ($response->successful()) {
                foreach ((array) ($response->json('resolved') ?? []) as $lidKey => $phone) {
                    $lid = $this->normalizeLidDigits((string) $lidKey);
                    $normalizedPhone = PhoneNormalizer::digits((string) $phone);
                    if ($lid && $normalizedPhone !== '' && !$this->looksLikeLid($normalizedPhone)) {
                        $liveResolved[$lid] = $normalizedPhone;
                    }
                }
            } else {
                Log::warning('[WhatsApp LID Resolve] mirror responded unsuccessfully', [
                    'tenant_id' => $tenantId,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        }

        $resolvedMap = $locallyResolved + $liveResolved;
        $applied = $this->applyResolvedMap($tenantId, $resolvedMap);

        return array_merge($empty, $applied, [
            'attempted' => count($lids),
            'resolved' => count($resolvedMap),
            'unresolved' => max(0, count($lids) - count($resolvedMap)),
            'resolved_map' => $resolvedMap,
            'skipped_reason' => null,
        ]);
    }

    /**
     * @return array<int, string>
     */
    public function collectUnresolvedLids(int $tenantId): array
    {
        $lids = [];

        if (Schema::hasTable('whatsapp_contacts')) {
            WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('lid')
                ->where(function ($query) {
                    $query->whereNull('phone')->orWhere('phone', '');
                })
                ->limit(500)
                ->pluck('lid')
                ->each(function ($lid) use (&$lids) {
                    $normalized = $this->normalizeLidDigits((string) $lid);
                    if ($normalized) {
                        $lids[$normalized] = true;
                    }
                });

            // Poisoned rows: phone column still holds the LID digits.
            WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('phone')
                ->limit(500)
                ->get(['phone', 'lid'])
                ->each(function (WhatsappContact $contact) use (&$lids) {
                    if ($this->looksLikeLid((string) $contact->phone)) {
                        $normalized = $this->normalizeLidDigits((string) ($contact->lid ?: $contact->phone));
                        if ($normalized) {
                            $lids[$normalized] = true;
                        }
                    }
                });
        }

        if (Schema::hasTable('whatsapp_unassigned_contacts')) {
            WhatsappUnassignedContact::query()
                ->where('tenant_id', $tenantId)
                ->where('is_unresolved_lid', true)
                ->where('status', 'pending')
                ->limit(500)
                ->pluck('phone')
                ->each(function ($phone) use (&$lids) {
                    $normalized = $this->normalizeLidDigits((string) $phone);
                    if ($normalized) {
                        $lids[$normalized] = true;
                    }
                });
        }

        WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', 'mirror')
            ->latest('id')
            ->limit(2000)
            ->get(['from', 'to', 'counterpart_lid', 'direction'])
            ->each(function (WhatsappMessage $message) use (&$lids) {
                foreach ([
                    $message->counterpart_lid,
                    $message->direction === 'outbound' ? $message->to : $message->from,
                    $message->from,
                    $message->to,
                ] as $candidate) {
                    $normalized = $this->normalizeLidDigits((string) ($candidate ?? ''));
                    if ($normalized) {
                        $lids[$normalized] = true;
                    }
                }
            });

        return array_keys($lids);
    }

    /**
     * @param  array<string, string>  $resolvedMap
     * @return array{
     *   contacts_updated: int,
     *   unassigned_updated: int,
     *   group_contacts_updated: int,
     *   messages_updated: int
     * }
     */
    public function applyResolvedMap(int $tenantId, array $resolvedMap): array
    {
        $contactsUpdated = 0;
        $unassignedUpdated = 0;
        $messagesUpdated = 0;

        foreach ($resolvedMap as $lid => $phone) {
            $lid = $this->normalizeLidDigits((string) $lid);
            $phone = PhoneNormalizer::digits((string) $phone);
            if (!$lid || $phone === '' || $this->looksLikeLid($phone)) {
                continue;
            }

            $contact = $this->contactStore->upsertContact($tenantId, [
                'lid' => $lid,
                'phone' => $phone,
                'source' => 'lid_resolution_service',
            ]);
            if ($contact) {
                $contactsUpdated++;
            }

            $unassignedUpdated += $this->applyToUnassignedContacts($tenantId, $lid, $phone);
            $messagesUpdated += $this->applyToMessages($tenantId, $lid, $phone);
        }

        $groupContactsUpdated = $this->groupContactService->applyResolvedLidMap($tenantId, $resolvedMap);

        return [
            'contacts_updated' => $contactsUpdated,
            'unassigned_updated' => $unassignedUpdated,
            'group_contacts_updated' => $groupContactsUpdated,
            'messages_updated' => $messagesUpdated,
        ];
    }

    private function applyToUnassignedContacts(int $tenantId, string $lid, string $phone): int
    {
        if (!Schema::hasTable('whatsapp_unassigned_contacts')) {
            return 0;
        }

        $contacts = WhatsappUnassignedContact::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) use ($lid) {
                $query->where('phone', $lid)
                    ->orWhere(function ($inner) use ($lid) {
                        $inner->where('is_unresolved_lid', true)
                            ->where('phone', $lid);
                    });
            })
            ->get();

        $updated = 0;

        foreach ($contacts as $contact) {
            $existing = WhatsappUnassignedContact::query()
                ->where('tenant_id', $tenantId)
                ->where('phone', $phone)
                ->where('id', '!=', $contact->id)
                ->first();

            if ($existing) {
                $existing->messages_count = (int) $existing->messages_count + (int) $contact->messages_count;
                if ($contact->last_message_at && (!$existing->last_message_at || $contact->last_message_at->gt($existing->last_message_at))) {
                    $existing->last_message_at = $contact->last_message_at;
                    $existing->last_message_body = $contact->last_message_body ?: $existing->last_message_body;
                }
                $existing->push_name = $existing->push_name ?: $contact->push_name;
                $existing->is_unresolved_lid = false;
                $existing->save();
                $contact->delete();
            } else {
                $contact->phone = $phone;
                $contact->is_unresolved_lid = false;
                $contact->save();
            }

            $updated++;
        }

        return $updated;
    }

    private function applyToMessages(int $tenantId, string $lid, string $phone): int
    {
        $query = WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', 'mirror')
            ->where(function ($inner) use ($lid) {
                $inner->where('from', $lid)
                    ->orWhere('to', $lid);

                if (Schema::hasColumn('whatsapp_messages', 'counterpart_lid')) {
                    $inner->orWhere('counterpart_lid', $lid);
                }
            });

        $updated = 0;

        foreach ($query->limit(3000)->cursor() as $message) {
            $dirty = false;

            if ((string) $message->from === $lid) {
                $message->from = $phone;
                $dirty = true;
            }

            if ((string) $message->to === $lid) {
                $message->to = $phone;
                $dirty = true;
            }

            if (Schema::hasColumn('whatsapp_messages', 'counterpart_lid') && !filled($message->counterpart_lid)) {
                $message->counterpart_lid = $lid;
                $dirty = true;
            }

            $raw = is_array($message->raw) ? $message->raw : [];
            $nested = is_array($raw['message'] ?? null) ? $raw['message'] : [];
            if (($nested['resolved_phone'] ?? null) !== $phone || ($raw['resolved_phone'] ?? null) !== $phone) {
                $nested['resolved_phone'] = $phone;
                $raw['message'] = $nested;
                $raw['resolved_phone'] = $phone;
                $message->raw = $raw;
                $dirty = true;
            }

            if ($dirty) {
                $message->save();
                $updated++;
            }
        }

        return $updated;
    }

    /**
     * @param  array<int, string>  $lids
     * @return array<int, string>
     */
    private function normalizeLidList(array $lids): array
    {
        $out = [];
        foreach ($lids as $lid) {
            $normalized = $this->normalizeLidDigits((string) $lid);
            if ($normalized) {
                $out[$normalized] = true;
            }
        }

        return array_keys($out);
    }

    private function normalizeLidDigits(string $value): ?string
    {
        $raw = strtolower(trim($value));
        if ($raw === '') {
            return null;
        }

        $digits = PhoneNormalizer::digits(explode('@', $raw)[0] ?? $raw);
        if ($digits === '') {
            return null;
        }

        if (str_contains($raw, '@lid') || strlen($digits) >= 14) {
            return $digits;
        }

        return null;
    }

    private function looksLikeLid(?string $value): bool
    {
        $digits = PhoneNormalizer::digits((string) ($value ?? ''));

        return $digits !== '' && strlen($digits) >= 14;
    }
}
