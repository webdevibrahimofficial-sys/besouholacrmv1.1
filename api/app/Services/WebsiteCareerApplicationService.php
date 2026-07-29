<?php

namespace App\Services;

use App\Models\WebsiteIntakeLog;
use App\Models\WebsiteJobApplication;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class WebsiteCareerApplicationService
{
    public function __construct(
        private readonly WebsiteApiKeyService $apiKeyService,
        private readonly TenantStorageService $tenantStorageService,
    ) {
    }

    public function handle(string $apiKey, array $payload, Request $request): WebsiteJobApplication
    {
        $connection = $this->apiKeyService->resolveConnection($apiKey);

        if (!$connection) {
            $this->logIntake(null, null, 'career_invalid_key', $payload, 'Invalid API key.', $request);
            throw new HttpException(401, 'Invalid website API key.');
        }

        if (!$connection->is_active) {
            $this->logIntake((int) $connection->tenant_id, (int) $connection->id, 'career_inactive_connection', $payload, 'Website connection is inactive.', $request);
            throw new HttpException(401, 'Website connection is inactive.');
        }

        $origin = $request->headers->get('Origin');
        if (!$this->isOriginAllowed($connection->allowed_origins, (bool) $connection->allow_all_origins_for_testing, $origin)) {
            $this->logIntake((int) $connection->tenant_id, (int) $connection->id, 'career_blocked_origin', $payload, 'Origin is not allowed for this website connection.', $request);
            throw new HttpException(403, 'Origin is not allowed for this website connection.');
        }

        $tenantId = (int) $connection->tenant_id;
        $boundTenant = app()->bound('current_tenant_id');
        $previousTenantId = $boundTenant ? app('current_tenant_id') : null;

        try {
            app()->instance('current_tenant_id', $tenantId);

            $cvUpload = null;
            if ($request->hasFile('cv')) {
                $cvUpload = $this->tenantStorageService->upload($request->file('cv'), 'career-applications/cv');
            }

            DB::beginTransaction();

            $application = WebsiteJobApplication::create([
                'tenant_id' => $tenantId,
                'website_connection_id' => (int) $connection->id,
                'status' => 'new',
                'source' => 'website_careers',
                'role_slug' => $this->nullableString($payload['role_slug'] ?? null),
                'role_title' => $this->nullableString($payload['role_title'] ?? null),
                'full_name' => trim((string) ($payload['full_name'] ?? '')),
                'email' => trim((string) ($payload['email'] ?? '')),
                'phone' => trim((string) ($payload['phone'] ?? '')),
                'current_role' => $this->nullableString($payload['current_role'] ?? null),
                'years_experience' => $this->nullableString($payload['years_experience'] ?? null),
                'location' => $this->nullableString($payload['location'] ?? null),
                'work_preference' => $this->nullableString($payload['work_preference'] ?? null),
                'linkedin_url' => $this->nullableString($payload['linkedin_url'] ?? null),
                'portfolio_url' => $this->nullableString($payload['portfolio_url'] ?? null),
                'salary_expectation' => $this->nullableString($payload['salary_expectation'] ?? null),
                'availability' => $this->nullableString($payload['availability'] ?? null),
                'motivation' => $this->nullableString($payload['motivation'] ?? null),
                'biggest_achievement' => $this->nullableString($payload['biggest_achievement'] ?? null),
                'cover_letter' => $this->nullableString($payload['cover_letter'] ?? null),
                'cv_path' => $cvUpload['path'] ?? null,
                'cv_original_name' => $request->file('cv')?->getClientOriginalName(),
                'cv_mime' => $request->file('cv')?->getMimeType(),
                'cv_size' => $request->file('cv')?->getSize(),
                'answers' => is_array($payload['answers'] ?? null) ? $payload['answers'] : null,
                'meta_data' => $this->buildMetaData($connection, $payload, $cvUpload),
                'ip_address' => $request->ip(),
                'origin' => $origin,
                'user_agent' => $request->userAgent(),
            ]);

            $connection->forceFill([
                'last_used_at' => now(),
                'requests_count' => (int) $connection->requests_count + 1,
            ])->save();

            $this->logIntake($tenantId, (int) $connection->id, 'career_success', $payload, null, $request);

            DB::commit();

            return $application;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->logIntake($tenantId, (int) $connection->id, 'career_exception', $payload, $e->getMessage(), $request);
            throw $e;
        } finally {
            if ($boundTenant) {
                app()->instance('current_tenant_id', $previousTenantId);
            } else {
                app()->forgetInstance('current_tenant_id');
            }
        }
    }

    private function buildMetaData($connection, array $payload, ?array $cvUpload): array
    {
        $existing = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];

        return [
            'integration' => 'website_careers',
            'connection_id' => $connection->id,
            'connection_name' => $connection->name,
            'form_name' => $existing['form_name'] ?? 'Career Application Form',
            'page_url' => $existing['page_url'] ?? null,
            'utm_source' => $existing['utm_source'] ?? null,
            'utm_campaign' => $existing['utm_campaign'] ?? null,
            'utm_medium' => $existing['utm_medium'] ?? null,
            'session_id' => $existing['session_id'] ?? null,
            'device' => $existing['device'] ?? null,
            'browser' => $existing['browser'] ?? null,
            'referrer' => $existing['referrer'] ?? null,
            'cv_url' => $cvUpload['url'] ?? null,
            'payload_meta' => $existing,
        ];
    }

    private function nullableString($value): ?string
    {
        $value = trim((string) ($value ?? ''));
        return $value !== '' ? $value : null;
    }

    private function isOriginAllowed(?array $allowedOrigins, bool $allowAllOriginsForTesting, ?string $origin): bool
    {
        if ($allowAllOriginsForTesting) {
            return true;
        }

        $normalizedOrigin = $this->normalizeOrigin($origin);
        $configuredOrigins = array_values(array_filter(array_map(fn ($item) => $this->normalizeOrigin($item), $allowedOrigins ?? [])));

        if (empty($configuredOrigins)) {
            return !app()->environment('production');
        }

        if (!$normalizedOrigin) {
            return false;
        }

        return in_array($normalizedOrigin, $configuredOrigins, true);
    }

    private function normalizeOrigin(?string $origin): ?string
    {
        $origin = trim((string) $origin);
        if ($origin === '') {
            return null;
        }

        $parts = parse_url($origin);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return rtrim(strtolower($origin), '/');
        }

        $value = strtolower($parts['scheme']) . '://' . strtolower($parts['host']);
        if (isset($parts['port'])) {
            $value .= ':' . $parts['port'];
        }

        return $value;
    }

    private function logIntake(?int $tenantId, ?int $connectionId, string $status, array $payload, ?string $errorMessage, Request $request): WebsiteIntakeLog
    {
        return WebsiteIntakeLog::create([
            'tenant_id' => $tenantId,
            'website_connection_id' => $connectionId,
            'status' => $status,
            'payload' => $payload,
            'error_message' => $errorMessage,
            'ip_address' => $request->ip(),
            'origin' => $request->headers->get('Origin'),
            'user_agent' => $request->userAgent(),
        ]);
    }
}
