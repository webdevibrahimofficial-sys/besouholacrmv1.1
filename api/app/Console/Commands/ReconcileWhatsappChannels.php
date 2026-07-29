<?php

namespace App\Console\Commands;

use App\Services\Whatsapp\WhatsappChannelConflictService;
use Illuminate\Console\Command;

class ReconcileWhatsappChannels extends Command
{
    protected $signature = 'whatsapp:reconcile-channels';

    protected $description = 'Detect and fix WhatsApp channel conflicts (duplicate active phones, etc.)';

    public function handle(WhatsappChannelConflictService $conflictService): int
    {
        $issues = $conflictService->detectConflicts();
        $fixed = $conflictService->reconcile();

        $this->info('Detected ' . count($issues) . ' issue(s), fixed ' . $fixed . ' channel(s).');

        foreach ($issues as $issue) {
            $this->line(json_encode($issue));
        }

        return self::SUCCESS;
    }
}
