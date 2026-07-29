<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class InboundWhatsappMessage implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $tenantId;
    public array $message;

    public function __construct(int $tenantId, array $message)
    {
        $this->tenantId = $tenantId;
        $this->message = $message;
    }

    public function broadcastOn(): Channel
    {
        return new Channel('tenant-' . $this->tenantId . '-whatsapp');
    }
}
