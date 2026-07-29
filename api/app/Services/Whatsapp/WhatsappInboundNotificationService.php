<?php

namespace App\Services\Whatsapp;

use App\Models\Lead;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Notifications\WhatsappInboundMessageNotification;

class WhatsappInboundNotificationService
{
    public function notifyAssignedSales(Lead $lead, WhatsappMessage $message): void
    {
        if ((string) ($message->direction ?? '') !== 'inbound') {
            return;
        }

        $assignedUserId = (int) ($lead->assigned_to ?? 0);
        if ($assignedUserId <= 0) {
            return;
        }

        $recipient = User::query()
            ->where('tenant_id', $lead->tenant_id)
            ->where('id', $assignedUserId)
            ->first();

        if (!$recipient) {
            return;
        }

        $recipient->notify(new WhatsappInboundMessageNotification($lead, $message));
    }
}
