<?php

namespace App\Jobs;

use App\Models\MetaConnection;
use App\Services\MetaAuthService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SyncMetaAssets implements ShouldQueue, NotTenantAware
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public int|string $tenantId,
        public int $connectionId
    ) {
        $this->onConnection(config('queue.meta_connection', 'redis'));
        $this->onQueue('meta');
    }

    public function handle(MetaAuthService $metaAuthService): void
    {
        app()->instance('current_tenant_id', $this->tenantId);

        $connection = MetaConnection::withoutGlobalScopes()
            ->whereKey($this->connectionId)
            ->where('tenant_id', $this->tenantId)
            ->first();

        if (!$connection) {
            Log::warning('Meta asset sync skipped because connection was not found.', [
                'tenant_id' => $this->tenantId,
                'connection_id' => $this->connectionId,
            ]);

            return;
        }

        $metaAuthService->syncAssets($connection);
    }
}
