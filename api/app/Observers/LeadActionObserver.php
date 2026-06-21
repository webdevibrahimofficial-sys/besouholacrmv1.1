<?php

namespace App\Observers;

use App\Models\LeadAction;
use App\Models\Lead;

class LeadActionObserver
{
    /**
     * Handle the LeadAction "created" event.
     * Update lead's actual action timestamps when a new action is created.
     */
    public function created(LeadAction $action): void
    {
        if ($action->lead_id) {
            Lead::where('id', $action->lead_id)->update([
                'last_action_at' => $action->created_at ?? now(),
                'last_contact' => $action->created_at ?? now(),
            ]);
        }
    }

    /**
     * NOTE: We deliberately do NOT update last_contact on LeadAction updates.
     * 
     * Reason: last_contact should track when an action WAS CREATED (a real business event),
     * not when someone edited the action notes or other fields.
     * If you need to track edit timestamps, add a separate 'last_edited_at' column.
     */
}
