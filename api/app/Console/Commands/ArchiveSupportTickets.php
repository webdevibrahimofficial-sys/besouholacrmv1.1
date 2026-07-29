<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Models\Ticket;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ArchiveSupportTickets extends Command
{
    protected $signature = 'support:archive-tickets {--tenant= : Tenant id or slug (optional)} {--and-drop : Drop tickets table after archiving all tenants}';

    protected $description = 'Archive Support tickets per tenant into JSON files';

    public function handle(): int
    {
        $tenantOpt = $this->option('tenant');
        $andDrop = (bool) $this->option('and-drop');

        if ($andDrop && $tenantOpt) {
            $this->error('--and-drop requires archiving all tenants (remove --tenant).');
            return self::FAILURE;
        }

        if (!Schema::hasTable('tickets')) {
            $this->warn('tickets table does not exist. Nothing to archive.');
            return self::SUCCESS;
        }

        $query = Tenant::query();
        if ($tenantOpt) {
            $query->where('id', $tenantOpt)->orWhere('slug', $tenantOpt);
        }
        $tenants = $query->get();
        if ($tenants->isEmpty()) {
            $this->warn('No tenants matched.');
            return self::SUCCESS;
        }

        $date = now()->format('Ymd');

        foreach ($tenants as $tenant) {
            $tickets = Ticket::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->with(['department:id,name', 'assignedTo:id,name,email', 'customer:id,name,email,phone'])
                ->orderBy('id')
                ->get();

            $payload = [
                'archived_at' => now()->toISOString(),
                'tenant' => [
                    'id' => $tenant->id,
                    'slug' => $tenant->slug,
                    'name' => $tenant->name,
                ],
                'count' => $tickets->count(),
                'tickets' => $tickets->map(function (Ticket $t) {
                    return [
                        'id' => $t->id,
                        'tenant_id' => $t->tenant_id,
                        'title' => $t->title ?? null,
                        'description' => $t->description ?? null,
                        'status' => $t->status ?? null,
                        'priority' => $t->priority ?? null,
                        'department_id' => $t->department_id ?? null,
                        'assigned_to' => $t->assigned_to ?? null,
                        'customer_id' => $t->customer_id ?? null,
                        'meta_data' => $t->meta_data ?? null,
                        'created_at' => optional($t->created_at)->toISOString(),
                        'updated_at' => optional($t->updated_at)->toISOString(),
                        'department' => $t->department ? ['id' => $t->department->id, 'name' => $t->department->name] : null,
                        'assigned_user' => $t->assignedTo ? ['id' => $t->assignedTo->id, 'name' => $t->assignedTo->name, 'email' => $t->assignedTo->email] : null,
                        'customer' => $t->customer ? ['id' => $t->customer->id, 'name' => $t->customer->name, 'email' => $t->customer->email, 'phone' => $t->customer->phone] : null,
                    ];
                })->values(),
            ];

            $path = "backups/support-tickets/{$tenant->slug}-tickets-{$date}.json";
            Storage::disk('local')->put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            $this->info("Archived {$payload['count']} tickets for {$tenant->slug} -> storage/app/{$path}");
        }

        if ($andDrop) {
            Schema::dropIfExists('tickets');
            $this->warn('Dropped tickets table.');
        }

        return self::SUCCESS;
    }
}

