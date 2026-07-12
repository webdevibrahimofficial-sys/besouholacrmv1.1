<?php

namespace Tests\Support;

use App\Models\SystemSetting;
use App\Services\MetaSystemSettingsService;
use Illuminate\Support\Facades\Crypt;

trait SeedsSharedMetaApp
{
    protected function seedSharedMetaApp(
        string $appId = '1234567890',
        string $appSecret = 'shared-app-secret',
        string $verifyToken = 'shared-verify-token'
    ): void {
        SystemSetting::updateOrCreate(
            ['key' => MetaSystemSettingsService::KEY_APP_ID],
            ['value' => $appId]
        );

        SystemSetting::updateOrCreate(
            ['key' => MetaSystemSettingsService::KEY_APP_SECRET],
            ['value' => Crypt::encryptString($appSecret)]
        );

        SystemSetting::updateOrCreate(
            ['key' => MetaSystemSettingsService::KEY_VERIFY_TOKEN],
            ['value' => $verifyToken]
        );
    }
}
