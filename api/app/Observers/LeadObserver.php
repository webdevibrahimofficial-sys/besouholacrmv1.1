<?php

namespace App\Observers;

use App\Models\Lead;
use App\Services\MetaCapiService;
use Illuminate\Support\Facades\Log;

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

        $this->dispatchLeadCapiEvent($lead);
    }

    protected function dispatchLeadCapiEvent(Lead $lead): void
    {
        if (! $lead->tenant_id) {
            return;
        }

        // Preserve prior MetaLeadService behavior for Postman webhook drills.
        if (is_string($lead->meta_id) && str_starts_with(strtolower($lead->meta_id), 'postman-test-')) {
            return;
        }

        try {
            app(MetaCapiService::class)->sendLeadEventIfEnabled($lead->tenant_id, $lead);
        } catch (\Throwable $e) {
            Log::warning('Meta CAPI lead observer dispatch failed.', [
                'tenant_id' => $lead->tenant_id,
                'lead_id' => $lead->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
