<?php

namespace App\Models;

use App\Traits\UsesTenantOrSharedConnection;
use NotificationChannels\WebPush\PushSubscription;

class TenantPushSubscription extends PushSubscription
{
    use UsesTenantOrSharedConnection;

    public function getConnectionName(): ?string
    {
        return $this->connection ?? parent::getConnectionName();
    }
}
