<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappChannel;
use Illuminate\Validation\ValidationException;

class WhatsappChannelConflictService
{
    public function assertNoActivePhoneConflict(
        int $tenantId,
        string $normalizedPhone,
        string $provider,
        int $excludeChannelId = 0
    ): void {
        $normalizedPhone = preg_replace('/\D+/', '', trim($normalizedPhone));
        if ($tenantId <= 0 || $normalizedPhone === '') {
            return;
        }

        $existing = WhatsappChannel::query()
            ->where('tenant_id', $tenantId)
            ->where('normalized_phone', $normalizedPhone)
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->when($excludeChannelId > 0, fn ($q) => $q->where('id', '!=', $excludeChannelId))
            ->first();

        if ($existing && $existing->provider !== $provider) {
            throw ValidationException::withMessages([
                'phone_number' => [
                    "Phone number is already active on {$existing->provider} channel. Disconnect it first.",
                ],
            ]);
        }
    }

    public function assertNoActivePhoneNumberIdConflict(string $phoneNumberId, int $excludeChannelId = 0): void
    {
        $phoneNumberId = trim($phoneNumberId);
        if ($phoneNumberId === '') {
            return;
        }

        $existing = WhatsappChannel::query()
            ->where('phone_number_id', $phoneNumberId)
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->when($excludeChannelId > 0, fn ($q) => $q->where('id', '!=', $excludeChannelId))
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'phone_number_id' => [
                    'This Phone Number ID is already linked to another active channel.',
                ],
            ]);
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function detectConflicts(): array
    {
        $issues = [];

        $channels = WhatsappChannel::query()
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->orderBy('tenant_id')
            ->get();

        $byTenantPhone = [];
        foreach ($channels as $channel) {
            if (! $channel->normalized_phone) {
                continue;
            }
            $key = $channel->tenant_id . ':' . $channel->normalized_phone;
            $byTenantPhone[$key][] = $channel;
        }

        foreach ($byTenantPhone as $group) {
            if (count($group) <= 1) {
                continue;
            }
            $providers = collect($group)->pluck('provider')->unique()->values();
            if ($providers->count() > 1) {
                $issues[] = [
                    'type' => 'duplicate_active_phone',
                    'tenant_id' => $group[0]->tenant_id,
                    'normalized_phone' => $group[0]->normalized_phone,
                    'channel_ids' => collect($group)->pluck('id')->all(),
                ];
            }
        }

        $primaryCounts = WhatsappChannel::query()
            ->selectRaw('tenant_id, COUNT(*) as cnt')
            ->where('is_primary', true)
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->groupBy('tenant_id')
            ->having('cnt', '>', 1)
            ->get();

        foreach ($primaryCounts as $row) {
            $issues[] = [
                'type' => 'multiple_primary',
                'tenant_id' => (int) $row->tenant_id,
                'count' => (int) $row->cnt,
            ];
        }

        return $issues;
    }

    public function reconcile(): int
    {
        $fixed = 0;

        foreach ($this->detectConflicts() as $issue) {
            if ($issue['type'] === 'duplicate_active_phone') {
                $ids = array_slice($issue['channel_ids'], 1);
                WhatsappChannel::query()
                    ->whereIn('id', $ids)
                    ->update([
                        'status' => WhatsappChannel::STATUS_ERROR,
                        'last_error' => 'Conflict: duplicate active phone detected by reconciliation job.',
                    ]);
                $fixed += count($ids);
            }
        }

        return $fixed;
    }
}
