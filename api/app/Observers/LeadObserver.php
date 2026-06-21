<?php

namespace App\Observers;

use App\Models\Lead;

class LeadObserver
{
    /**
     * Handle the Lead "updating" event.
     * Set assigned_at when assigned_to changes
     */
    public function updating(Lead $lead): void
    {
        // Check if assigned_to is changing and wasn't previously set
        if ($lead->isDirty('assigned_to')) {
            $oldAssignedTo = $lead->getOriginal('assigned_to');
            
            // If being assigned for the first time or reassigned
            if (!$oldAssignedTo || $oldAssignedTo != $lead->assigned_to) {
                $lead->assigned_at = now();
            }
        }
    }

    /**
     * Handle the Lead "created" event.
     */
    public function created(Lead $lead): void
    {
        // Set assigned_at if assigned_to is set during creation
        if ($lead->assigned_to && !$lead->assigned_at) {
            $lead->update(['assigned_at' => now()]);
        }
    }
}
