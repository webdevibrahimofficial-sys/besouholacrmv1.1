<?php

namespace App\Console\Commands;

use App\Models\MetaConnection;
use App\Services\MetaAuthService;
use App\Services\MetaConnectionNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RefreshMetaTokens extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'meta:refresh-tokens {--days=7 : Refresh tokens that expire within this many days}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Refresh Meta Long-Lived User Access Tokens before they expire';

    /**
     * Execute the console command.
     */
    public function handle(MetaAuthService $authService, MetaConnectionNotifier $notifier)
    {
        $days = max(1, (int) $this->option('days'));

        // Refresh tokens that expire within the next N days
        $expiringSoon = MetaConnection::whereNotNull('expires_at')
            ->where('expires_at', '<=', now()->addDays($days))
            ->get();

        $this->info("Found " . $expiringSoon->count() . " tokens expiring soon.");

        foreach ($expiringSoon as $connection) {
            $this->info("Refreshing token for connection: {$connection->id} (Tenant: {$connection->tenant_id})");
            try {
                $result = $authService->refreshToken($connection);
                if ($result) {
                    $freshConnection = $connection->fresh();
                    if ($this->stillNeedsAttention($freshConnection, $days)) {
                        $reason = 'Token refresh completed but the expiry window is still too close.';
                        $notifier->notifyTokenIssue($freshConnection, $reason);
                        $this->warn($reason);
                        continue;
                    }

                    $this->info("Token refreshed successfully.");
                } else {
                    // The refresh path already alerts (with daily dedupe); this is
                    // an idempotent safety net in case that path changes.
                    $notifier->notifyTokenIssue($connection, 'Automatic token refresh failed. Please reconnect your account.');
                    $this->error("Failed to refresh token.");
                }
            } catch (\Exception $e) {
                Log::error("Command error refreshing token for connection {$connection->id}: " . $e->getMessage());
                $notifier->notifyTokenIssue($connection, $e->getMessage());
                $this->error("Error: " . $e->getMessage());
            }
        }
        
        return 0;
    }

    protected function stillNeedsAttention(?MetaConnection $connection, int $days): bool
    {
        if (!$connection || !$connection->expires_at) {
            return true;
        }

        return $connection->expires_at->lte(now()->addDays($days));
    }
}
