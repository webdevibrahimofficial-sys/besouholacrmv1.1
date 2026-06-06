<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\FcmService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SendFcmNotificationJob implements ShouldQueue, NotTenantAware
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $userId,
        public ?int $tenantId,
        public string $title,
        public string $body,
        public array $data = []
    ) {
        $this->onConnection(config('queue.fcm_connection', 'redis'));
        $this->onQueue('fcm');
    }

    public function handle(FcmService $fcmService): void
    {
        try {
            $user = User::withoutGlobalScopes()
                ->whereKey($this->userId)
                ->when($this->tenantId, fn ($query) => $query->where('tenant_id', $this->tenantId))
                ->first();

            if (!$user) {
                return;
            }

            $result = $fcmService->sendToUser($user, $this->title, $this->body, $this->data);

            if (($result['ok'] ?? false) === false) {
                throw new \RuntimeException('FCM delivery failed.');
            }
        } catch (\Throwable $exception) {
            Log::error('SendFcmNotificationJob handle failed', [
                'user_id' => $this->userId,
                'tenant_id' => $this->tenantId,
                'message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('SendFcmNotificationJob failed', [
            'user_id' => $this->userId,
            'tenant_id' => $this->tenantId,
            'message' => $exception->getMessage(),
        ]);
    }
}
