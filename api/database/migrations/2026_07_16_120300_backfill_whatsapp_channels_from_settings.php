<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('whatsapp_settings') || ! Schema::hasTable('whatsapp_channels')) {
            return;
        }

        $settings = DB::table('whatsapp_settings')->get();

        foreach ($settings as $row) {
            $provider = strtolower(trim((string) ($row->provider ?? 'meta')));
            $canonicalProvider = in_array($provider, ['mirror', 'whatsapp mirror', 'whatsapp_mirror'], true)
                ? 'mirror'
                : 'meta_cloud';

            $phoneNumber = $row->business_number ?? null;
            $normalizedPhone = $phoneNumber
                ? preg_replace('/\D+/', '', (string) $phoneNumber)
                : null;
            $normalizedPhone = $normalizedPhone !== '' ? $normalizedPhone : null;

            $phoneNumberId = trim((string) ($row->phone_number_id ?? ''));
            if ($phoneNumberId === '' && ! empty($row->api_secret)) {
                $phoneNumberId = trim((string) $row->api_secret);
            }

            $status = ($row->status ?? false) ? 'connected' : 'disconnected';
            if ($canonicalProvider === 'mirror') {
                $session = DB::table('whatsapp_mirror_sessions')
                    ->where('tenant_id', $row->tenant_id)
                    ->first();
                if ($session) {
                    $status = match ($session->status ?? '') {
                        'connected' => 'connected',
                        'pending_qr', 'connecting', 'reconnecting' => 'connecting',
                        default => 'disconnected',
                    };
                    if (! $normalizedPhone && ! empty($session->connected_phone_number)) {
                        $phoneNumber = $session->connected_phone_number;
                        $normalizedPhone = preg_replace('/\D+/', '', (string) $phoneNumber) ?: null;
                    }
                }
            }

            $channelId = DB::table('whatsapp_channels')->insertGetId([
                'tenant_id' => $row->tenant_id,
                'provider' => $canonicalProvider,
                'display_name' => $canonicalProvider === 'mirror' ? 'WhatsApp Mirror' : 'Meta Cloud API',
                'phone_number' => $phoneNumber,
                'normalized_phone' => $normalizedPhone,
                'phone_number_id' => $phoneNumberId !== '' ? $phoneNumberId : null,
                'business_account_id' => $row->business_account_id ?? null,
                'mirror_session_id' => $canonicalProvider === 'mirror'
                    ? (DB::table('whatsapp_mirror_sessions')->where('tenant_id', $row->tenant_id)->value('id'))
                    : null,
                'access_token' => $row->api_key ?? null,
                'status' => $status,
                'is_primary' => true,
                'supports_inbound' => true,
                'supports_outbound' => true,
                'supports_ctwa_attribution' => $canonicalProvider === 'meta_cloud',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if (Schema::hasColumn('whatsapp_messages', 'channel_id')) {
                $messageQuery = DB::table('whatsapp_messages')->where('tenant_id', $row->tenant_id);

                if ($canonicalProvider === 'meta_cloud' && $phoneNumberId !== '') {
                    $messageQuery->where(function ($q) use ($phoneNumberId) {
                        $q->where('phone_number_id', $phoneNumberId)
                            ->orWhere('provider', 'meta')
                            ->orWhereNull('provider');
                    });
                } else {
                    $messageQuery->where(function ($q) {
                        $q->where('provider', 'mirror')->orWhereNull('provider');
                    });
                }

                $messageQuery->whereNull('channel_id')->update(['channel_id' => $channelId]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('whatsapp_messages', 'channel_id')) {
            DB::table('whatsapp_messages')->update(['channel_id' => null]);
        }

        DB::table('whatsapp_channels')->truncate();
    }
};
