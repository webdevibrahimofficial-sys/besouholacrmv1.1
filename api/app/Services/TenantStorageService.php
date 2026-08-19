<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

class TenantStorageService
{
    protected $disk = 'tenants';

    public const DEFAULT_URL_MINUTES = 60;

    public const AVATAR_URL_MINUTES = 60 * 24 * 7;

    /**
     * Upload a file for the current tenant.
     *
     * @param UploadedFile $file
     * @param string $folder (e.g., 'avatars', 'documents')
     * @return array ['path' => string, 'url' => string]
     */
    public function upload(UploadedFile $file, string $folder = 'general')
    {
        $tenantId = $this->resolveTenantId();
        
        // Structure: tenants/{tenant_id}/{folder}/{hash}.{ext}
        $path = $file->storeAs(
            "{$tenantId}/{$folder}",
            $file->hashName(),
            ['disk' => $this->disk]
        );

        Log::info("File uploaded for Tenant {$tenantId}", [
            'path' => $path,
            'size' => $file->getSize(),
            'mime' => $file->getMimeType(),
            'user_id' => Auth::id()
        ]);

        return [
            'path' => $path,
            'url' => $this->getUrl($path),
        ];
    }

    /**
     * Get a client-loadable signed URL for the file.
     *
     * Local disks are signed as a relative route (HMAC on path + expires) then prefixed
     * with APP_URL so mobile/web can open an absolute https URL. TenantFileController
     * validates with hasValidSignature(false), so signing the host into the HMAC breaks
     * every /api/files request.
     */
    public function getUrl(string $path, int $minutes = self::DEFAULT_URL_MINUTES)
    {
        if (config('filesystems.disks.tenants.driver') === 's3') {
            /** @var \Illuminate\Filesystem\FilesystemAdapter $disk */
            $disk = Storage::disk($this->disk);
            return $disk->temporaryUrl(
                $path,
                now()->addMinutes($minutes)
            );
        }

        return rtrim((string) config('app.url'), '/') . $this->signedLocalPath($path, $minutes);
    }

    /**
     * Browser-loadable signed URL. Absolute APP_URL hosts (e.g. Docker "http://web")
     * are not reachable from the SPA. For local disks, sign as a relative URL so the
     * signature stays valid when loaded from tenant subdomains via <img>/<video>.
     * Leave S3 / external URLs absolute.
     */
    public function getBrowserUrl(string $path, int $minutes = self::DEFAULT_URL_MINUTES): string
    {
        if (config('filesystems.disks.tenants.driver') === 's3') {
            return $this->getUrl($path, $minutes);
        }

        return $this->signedLocalPath($path, $minutes);
    }

    protected function signedLocalPath(string $path, int $minutes): string
    {
        return URL::temporarySignedRoute(
            'tenant.files.show',
            now()->addMinutes($minutes),
            ['path' => $path],
            absolute: false
        );
    }

    public function toRelativeUrl(?string $url): ?string
    {
        if (!is_string($url)) {
            return null;
        }

        $url = trim($url);
        if ($url === '') {
            return null;
        }

        if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
            return $url;
        }

        $parts = parse_url($url);
        if (!is_array($parts) || empty($parts['path'])) {
            return $url;
        }

        $path = (string) $parts['path'];
        $isLocalMediaPath = str_contains($path, '/api/files/')
            || str_contains($path, '/api/whatsapp/media/');

        if (!$isLocalMediaPath) {
            return $url;
        }

        return $path . (isset($parts['query']) ? '?' . $parts['query'] : '');
    }

    /**
     * Delete a file.
     */
    public function delete(string $path)
    {
        if (Storage::disk($this->disk)->exists($path)) {
            return Storage::disk($this->disk)->delete($path);
        }
        return false;
    }

    /**
     * Resolve the current Tenant ID.
     */
    protected function resolveTenantId()
    {
        if (app()->bound('current_tenant_id')) {
            return app('current_tenant_id');
        }

        if (Auth::check()) {
            return Auth::user()->tenant_id;
        }

        throw new \Exception('No tenant context found for storage operation.');
    }
}
