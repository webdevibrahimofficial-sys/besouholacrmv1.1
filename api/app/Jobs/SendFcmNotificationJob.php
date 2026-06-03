<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\FcmService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendFcmNotificationJob implements ShouldQueue
{
    use Queueable;

    public string $queue = 'fcm';

    public int $tries = 3;

    public function __construct(
        public int $userId,
        public ?int $tenantId,
        public string $title,
        public string $body,
        public array $data = []
    ) {
    }

    public function handle(FcmService $fcmService): void
    {
        if ($this->tenantId) {
            app()->instance('current_tenant_id', $this->tenantId);
        }

        try {
            $user = User::find($this->userId);

            if (!$user) {
                return;
            }

            $result = $fcmService->sendToUser($user, $this->title, $this->body, $this->data);

            if (($result['ok'] ?? false) === false) {
                throw new \RuntimeException('FCM delivery failed.');
            }
        } finally {
            app()->forgetInstance('current_tenant_id');
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
