<?php

namespace Tests\Feature;

use App\Services\TenantStorageService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class TenantFileSignedUrlTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('tenants');
        Storage::disk('tenants')->put('28/avatars/photo.jpg', 'fake-image-bytes');
    }

    public function test_unsigned_file_url_is_forbidden(): void
    {
        $this->get('/api/files/28/avatars/photo.jpg')->assertForbidden();
    }

    public function test_relative_signed_url_serves_file(): void
    {
        $url = app(TenantStorageService::class)->getBrowserUrl('28/avatars/photo.jpg');

        $this->get($url)->assertOk();
    }

    public function test_login_style_absolute_url_uses_relative_signature_and_serves_file(): void
    {
        $url = app(TenantStorageService::class)->getUrl('28/avatars/photo.jpg');

        $this->assertStringStartsWith(rtrim((string) config('app.url'), '/'), $url);
        $this->assertStringContainsString('/api/files/28/avatars/photo.jpg', $url);

        $path = parse_url($url, PHP_URL_PATH) . '?' . parse_url($url, PHP_URL_QUERY);

        $this->get($path)->assertOk();
    }

    public function test_legacy_absolute_hmac_is_still_accepted(): void
    {
        $url = URL::signedRoute(
            'tenant.files.show',
            ['path' => '28/avatars/photo.jpg'],
            now()->addMinutes(60)
        );

        $this->get($url)->assertOk();
    }

    public function test_avatar_urls_last_seven_days(): void
    {
        $url = app(TenantStorageService::class)->getUrl(
            '28/avatars/photo.jpg',
            TenantStorageService::AVATAR_URL_MINUTES
        );

        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertGreaterThan(now()->addDays(6)->timestamp, (int) $query['expires']);
        $this->assertLessThanOrEqual(now()->addDays(7)->addMinute()->timestamp, (int) $query['expires']);
    }
}
