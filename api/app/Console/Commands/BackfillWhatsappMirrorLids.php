<?php

namespace App\Console\Commands;

use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappUnassignedContact;
use App\Services\Whatsapp\WhatsappMirrorClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class BackfillWhatsappMirrorLids extends Command
{
    protected $signature = 'whatsapp-mirror:backfill-lids
        {tenant? : Limit to a single tenant id}
        {--dry-run : Preview without writing any changes}';

    protected $description = 'Attempt to resolve previously-stored WhatsApp LIDs (e.g. "120569026592815") on '
        . 'pending unassigned contacts into real phone numbers, using each tenant\'s connected WhatsApp Mirror '
        . 'session. Requires the tenant\'s mirror session to be connected (or persisted) for resolution to work.';

    public function __construct(private readonly WhatsappMirrorClient $mirrorClient)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $tenantArg = $this->argument('tenant');

        $query = WhatsappUnassignedContact::query()
            ->where('is_unresolved_lid', true)
            ->where('status', 'pending');

        if ($tenantArg) {
            $query->where('tenant_id', (int) $tenantArg);
        }

        $contactsByTenant = $query->get()->groupBy('tenant_id');

        if ($contactsByTenant->isEmpty()) {
            $this->info('No unresolved-LID contacts found. Nothing to do.');
            return self::SUCCESS;
        }

        if ($isDryRun) {
            $this->comment('Running in --dry-run mode: no changes will be saved.');
        }

        $totalResolved = 0;
        $totalSkippedTenants = 0;

        foreach ($contactsByTenant as $currentTenantId => $contacts) {
            $session = WhatsappMirrorSession::where('tenant_id', $currentTenantId)->first();

            if (!$session || $session->status !== 'connected') {
                $totalSkippedTenants++;
                $this->warn(
                    "Tenant #{$currentTenantId}: mirror session is not connected, skipping "
                    . "({$contacts->count()} pending LID contact(s))."
                );
                continue;
            }

            $lids = $contacts->pluck('phone')->unique()->values()->all();
            $this->line("Tenant #{$currentTenantId}: attempting to resolve " . count($lids) . ' LID(s)...');

            try {
                $response = $this->mirrorClient->resolveLids((int) $currentTenantId, $lids);
            } catch (Throwable $e) {
                $this->error("Tenant #{$currentTenantId}: request to mirror service failed: {$e->getMessage()}");
                Log::error('[Backfill LIDs] mirror service request failed', [
                    'tenant_id' => $currentTenantId,
                    'error' => $e->getMessage(),
                ]);
                continue;
            }

            if (!$response->successful()) {
                $this->error("Tenant #{$currentTenantId}: mirror service responded with {$response->status()}: {$response->body()}");
                continue;
            }

            $resolved = (array) ($response->json('resolved') ?? []);

            if (empty($resolved)) {
                $this->line(
                    "Tenant #{$currentTenantId}: none of the LIDs could be resolved right now "
                    . '(WhatsApp still hides the real number for these contacts — try again later).'
                );
                continue;
            }

            foreach ($contacts as $contact) {
                $realPhone = $resolved[$contact->phone] ?? null;
                if (!$realPhone) {
                    continue;
                }

                $normalizedPhone = preg_replace('/\D+/', '', (string) $realPhone) ?: (string) $realPhone;

                $this->line(sprintf(
                    '  - Tenant #%s: %s -> %s (%s)',
                    $currentTenantId,
                    $contact->phone,
                    $normalizedPhone,
                    $contact->push_name ?: 'no name'
                ));

                if ($isDryRun) {
                    $totalResolved++;
                    continue;
                }

                // If a contact with the real phone already exists for this tenant
                // (e.g. it arrived via a different message path), merge into it
                // instead of violating the (tenant_id, phone) unique constraint.
                $existing = WhatsappUnassignedContact::query()
                    ->where('tenant_id', $currentTenantId)
                    ->where('phone', $normalizedPhone)
                    ->first();

                if ($existing && $existing->id !== $contact->id) {
                    $existing->messages_count = (int) $existing->messages_count + (int) $contact->messages_count;

                    if ($contact->last_message_at && (!$existing->last_message_at || $contact->last_message_at->gt($existing->last_message_at))) {
                        $existing->last_message_at = $contact->last_message_at;
                        $existing->last_message_body = $contact->last_message_body ?: $existing->last_message_body;
                    }

                    $existing->push_name = $existing->push_name ?: $contact->push_name;
                    $existing->is_unresolved_lid = false;
                    $existing->save();

                    $contact->delete();
                } else {
                    $contact->phone = $normalizedPhone;
                    $contact->is_unresolved_lid = false;
                    $contact->save();
                }

                $totalResolved++;
            }
        }

        $this->newLine();
        $this->info(sprintf(
            'Done. Resolved %d contact(s)%s. Skipped %d tenant(s) with no connected mirror session.',
            $totalResolved,
            $isDryRun ? ' (dry run, no changes saved)' : '',
            $totalSkippedTenants
        ));

        return self::SUCCESS;
    }
}
