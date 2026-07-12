<?php

namespace Database\Seeders;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class GeneralTenantLeadSeeder extends Seeder
{
    public function run(): void
    {
        $tenants = Tenant::query()
            ->whereRaw('LOWER(COALESCE(company_type, "")) = ?', ['general'])
            ->where('domain', 'like', '%.localhost')
            ->orderBy('id')
            ->get();

        if ($tenants->isEmpty()) {
            $this->command?->warn('No general localhost tenants found. Seed skipped.');
            return;
        }

        $rows = [
            ['name' => 'Ahmed Alaa', 'company' => 'Alaa Trading', 'email' => 'ahmed.alaa@example.com', 'phone' => '+201000000101', 'source' => 'Website', 'stage' => 'New', 'status' => 'Active', 'priority' => 'High', 'estimated_value' => 120000, 'notes' => 'Generated for chart testing', 'created_at' => '2021-01-14 09:15:00'],
            ['name' => 'Mona Hassan', 'company' => 'Hassan Supplies', 'email' => 'mona.hassan@example.com', 'phone' => '+201000000102', 'source' => 'Facebook', 'stage' => 'Contacted', 'status' => 'Active', 'priority' => 'Medium', 'estimated_value' => 98000, 'notes' => 'Generated for chart testing', 'created_at' => '2021-04-22 11:30:00'],
            ['name' => 'Karim Adel', 'company' => 'Adel Group', 'email' => 'karim.adel@example.com', 'phone' => '+201000000103', 'source' => 'WhatsApp', 'stage' => 'Qualified', 'status' => 'Active', 'priority' => 'High', 'estimated_value' => 142500, 'notes' => 'Generated for chart testing', 'created_at' => '2022-02-08 10:05:00'],
            ['name' => 'Sara Nabil', 'company' => 'Nabil Co', 'email' => 'sara.nabil@example.com', 'phone' => '+201000000104', 'source' => 'Referral', 'stage' => 'Proposal', 'status' => 'Active', 'priority' => 'Low', 'estimated_value' => 76000, 'notes' => 'Generated for chart testing', 'created_at' => '2022-06-17 15:40:00'],
            ['name' => 'Omar Fathy', 'company' => 'Fathy Services', 'email' => 'omar.fathy@example.com', 'phone' => '+201000000105', 'source' => 'Google Ads', 'stage' => 'Negotiation', 'status' => 'Active', 'priority' => 'High', 'estimated_value' => 210000, 'notes' => 'Generated for chart testing', 'created_at' => '2022-11-03 08:25:00'],
            ['name' => 'Dina Samir', 'company' => 'Samir Trading', 'email' => 'dina.samir@example.com', 'phone' => '+201000000106', 'source' => 'Website', 'stage' => 'Closed Won', 'status' => 'Converted', 'priority' => 'Medium', 'estimated_value' => 185000, 'notes' => 'Generated for chart testing', 'created_at' => '2023-01-19 12:00:00'],
            ['name' => 'Hany Mostafa', 'company' => 'Mostafa Imports', 'email' => 'hany.mostafa@example.com', 'phone' => '+201000000107', 'source' => 'Instagram', 'stage' => 'New', 'status' => 'Active', 'priority' => 'Low', 'estimated_value' => 64000, 'notes' => 'Generated for chart testing', 'created_at' => '2023-03-28 09:50:00'],
            ['name' => 'Laila Magdy', 'company' => 'Magdy House', 'email' => 'laila.magdy@example.com', 'phone' => '+201000000108', 'source' => 'Call', 'stage' => 'Contacted', 'status' => 'Active', 'priority' => 'Medium', 'estimated_value' => 92000, 'notes' => 'Generated for chart testing', 'created_at' => '2023-07-11 14:10:00'],
            ['name' => 'Tarek Youssef', 'company' => 'Youssef Center', 'email' => 'tarek.youssef@example.com', 'phone' => '+201000000109', 'source' => 'Website', 'stage' => 'Proposal', 'status' => 'Lost', 'priority' => 'High', 'estimated_value' => 131000, 'notes' => 'Generated for chart testing', 'created_at' => '2023-10-05 17:20:00'],
            ['name' => 'Nouran Ali', 'company' => 'Ali Group', 'email' => 'nouran.ali@example.com', 'phone' => '+201000000110', 'source' => 'WhatsApp', 'stage' => 'New', 'status' => 'Active', 'priority' => 'High', 'estimated_value' => 108000, 'notes' => 'Generated for chart testing', 'created_at' => '2024-02-14 10:35:00'],
            ['name' => 'Yousef Emad', 'company' => 'Emad Works', 'email' => 'yousef.emad@example.com', 'phone' => '+201000000111', 'source' => 'Facebook', 'stage' => 'Qualified', 'status' => 'Active', 'priority' => 'Medium', 'estimated_value' => 154000, 'notes' => 'Generated for chart testing', 'created_at' => '2024-05-09 13:45:00'],
            ['name' => 'Rana Kamal', 'company' => 'Kamal Factory', 'email' => 'rana.kamal@example.com', 'phone' => '+201000000112', 'source' => 'Google Ads', 'stage' => 'Negotiation', 'status' => 'Active', 'priority' => 'Low', 'estimated_value' => 87000, 'notes' => 'Generated for chart testing', 'created_at' => '2024-09-23 16:05:00'],
            ['name' => 'Mahmoud Sherif', 'company' => 'Sherif Group', 'email' => 'mahmoud.sherif@example.com', 'phone' => '+201000000113', 'source' => 'Referral', 'stage' => 'Closed Won', 'status' => 'Converted', 'priority' => 'High', 'estimated_value' => 225000, 'notes' => 'Generated for chart testing', 'created_at' => '2025-01-06 09:00:00'],
            ['name' => 'Salma Atef', 'company' => 'Atef Holding', 'email' => 'salma.atef@example.com', 'phone' => '+201000000114', 'source' => 'Instagram', 'stage' => 'Contacted', 'status' => 'Active', 'priority' => 'Medium', 'estimated_value' => 99000, 'notes' => 'Generated for chart testing', 'created_at' => '2025-04-18 11:25:00'],
            ['name' => 'Mostafa Zaki', 'company' => 'Zaki Solutions', 'email' => 'mostafa.zaki@example.com', 'phone' => '+201000000115', 'source' => 'Website', 'stage' => 'Proposal', 'status' => 'Lost', 'priority' => 'Low', 'estimated_value' => 73000, 'notes' => 'Generated for chart testing', 'created_at' => '2025-08-12 15:55:00'],
            ['name' => 'Heba Gamal', 'company' => 'Gamal Trading', 'email' => 'heba.gamal@example.com', 'phone' => '+201000000116', 'source' => 'Call', 'stage' => 'Negotiation', 'status' => 'Active', 'priority' => 'High', 'estimated_value' => 167000, 'notes' => 'Generated for chart testing', 'created_at' => '2026-02-21 10:20:00'],
            ['name' => 'Ahmed Zahran', 'company' => 'Zahran & Partners', 'email' => 'ahmed.zahran@example.com', 'phone' => '+201000000117', 'source' => 'Facebook', 'stage' => 'Qualified', 'status' => 'Active', 'priority' => 'Medium', 'estimated_value' => 119000, 'notes' => 'Generated for chart testing', 'created_at' => '2026-06-03 12:45:00'],
        ];

        $leadModel = new Lead();

        foreach ($tenants as $tenant) {
            $tenant->execute(function () use ($tenant, $rows, $leadModel) {
                $userIds = User::query()
                    ->where('tenant_id', $tenant->id)
                    ->pluck('id')
                    ->all();

                $assignedPool = $userIds ?: [null];
                $createdByPool = $userIds ?: [null];
                $connection = DB::connection(config('multitenancy.tenant_database_connection_name'));

                foreach ($rows as $index => $row) {
                    $createdAt = $row['created_at'];
                    unset($row['created_at']);

                    $payload = array_merge($row, [
                        'tenant_id' => $tenant->id,
                        'type' => 'Company',
                        'assigned_to' => $assignedPool[$index % count($assignedPool)],
                        'created_by' => $createdByPool[$index % count($createdByPool)],
                        'probability' => match ($row['stage']) {
                            'Closed Won' => 100,
                            'Negotiation' => 75,
                            'Proposal' => 60,
                            'Qualified' => 45,
                            'Contacted' => 25,
                            default => 10,
                        },
                        'last_contact' => $createdAt,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);

                    $connection->table($leadModel->getTable())->updateOrInsert(
                        [
                            'tenant_id' => $tenant->id,
                            'email' => $payload['email'],
                        ],
                        $payload
                    );
                }
            });
        }

        $this->command?->info(sprintf(
            'Seeded %d chart-test leads across %d local general tenants.',
            count($rows),
            $tenants->count()
        ));
    }
}
