<?php

namespace App\Console\Commands;

use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappLidResolutionService;
use Illuminate\Console\Command;

class BackfillWhatsappMirrorLids extends Command
{
    protected $signature = 'whatsapp-mirror:backfill-lids
        {tenant? : Limit to a single tenant id}
        {--dry-run : Preview without writing any changes}';

    protected $description = 'Resolve WhatsApp LIDs into real phone numbers across conversations, '
        . 'contacts, unassigned contacts, and group contacts using each tenant\'s connected Mirror session.';

    public function __construct(private readonly WhatsappLidResolutionService $lidResolutionService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $tenantArg = $this->argument('tenant');

        $tenantQuery = WhatsappMirrorSession::query()->select(['tenant_id', 'status']);
        if ($tenantArg) {
            $tenantQuery->where('tenant_id', (int) $tenantArg);
        }

        $sessions = $tenantQuery->get();
        if ($sessions->isEmpty()) {
            $this->info('No WhatsApp Mirror sessions found. Nothing to do.');
            return self::SUCCESS;
        }

        if ($isDryRun) {
            $this->comment('Running in --dry-run mode: resolution will be attempted but writes still go through contact cache; prefer connected tenants for accurate preview counts.');
        }

        $totalResolved = 0;
        $totalSkipped = 0;

        foreach ($sessions as $session) {
            $tenantId = (int) $session->tenant_id;
            $lids = $this->lidResolutionService->collectUnresolvedLids($tenantId);

            if (empty($lids)) {
                $this->line("Tenant #{$tenantId}: no unresolved LIDs.");
                continue;
            }

            if ($session->status !== 'connected') {
                $totalSkipped++;
                $this->warn("Tenant #{$tenantId}: mirror not connected, skipping " . count($lids) . ' LID(s).');
                continue;
            }

            $this->line("Tenant #{$tenantId}: resolving " . count($lids) . ' LID(s)...');

            if ($isDryRun) {
                foreach (array_slice($lids, 0, 20) as $lid) {
                    $this->line("  - would resolve: {$lid}");
                }
                if (count($lids) > 20) {
                    $this->line('  - ... and ' . (count($lids) - 20) . ' more');
                }
                continue;
            }

            $result = $this->lidResolutionService->resolveForTenant($tenantId, $lids);

            $this->info(sprintf(
                '  Tenant #%d: resolved %d/%d (contacts=%d, unassigned=%d, groups=%d, messages=%d)%s',
                $tenantId,
                (int) ($result['resolved'] ?? 0),
                (int) ($result['attempted'] ?? 0),
                (int) ($result['contacts_updated'] ?? 0),
                (int) ($result['unassigned_updated'] ?? 0),
                (int) ($result['group_contacts_updated'] ?? 0),
                (int) ($result['messages_updated'] ?? 0),
                ($result['skipped_reason'] ?? null) ? ' [' . $result['skipped_reason'] . ']' : ''
            ));

            foreach ($result['resolved_map'] ?? [] as $lid => $phone) {
                $this->line("  - {$lid} -> {$phone}");
            }

            $totalResolved += (int) ($result['resolved'] ?? 0);
        }

        $this->newLine();
        $this->info("Done. Resolved {$totalResolved} LID(s). Skipped {$totalSkipped} tenant(s).");

        return self::SUCCESS;
    }
}
