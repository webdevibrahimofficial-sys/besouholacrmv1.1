<?php

namespace Database\Seeders;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class GeneralTenantLeadActionsSeeder extends Seeder
{
    private const SEED_TAG = 'general_localhost_actions_v1';

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

        $stageBlueprints = [
            ['name' => 'Pending', 'name_ar' => 'قيد الانتظار', 'type' => 'follow_up', 'order' => 10, 'color' => '#F59E0B', 'icon' => 'Clock3'],
            ['name' => 'Contacted', 'name_ar' => 'تم التواصل', 'type' => 'follow_up', 'order' => 20, 'color' => '#3B82F6', 'icon' => 'PhoneCall'],
            ['name' => 'Qualified', 'name_ar' => 'مؤهل', 'type' => 'follow_up', 'order' => 30, 'color' => '#22C55E', 'icon' => 'BadgeCheck'],
            ['name' => 'Negotiation', 'name_ar' => 'تفاوض', 'type' => 'follow_up', 'order' => 40, 'color' => '#8B5CF6', 'icon' => 'MessagesSquare'],
            ['name' => 'Proposal', 'name_ar' => 'عرض سعر', 'type' => 'proposal', 'order' => 50, 'color' => '#EC4899', 'icon' => 'FileText'],
            ['name' => 'Closed Won', 'name_ar' => 'مغلق - ربح', 'type' => 'closing_deals', 'order' => 60, 'color' => '#10B981', 'icon' => 'Handshake'],
        ];

        $salesUsers = [
            ['name' => 'General Sales One', 'job_title' => 'Sales Person'],
            ['name' => 'General Sales Two', 'job_title' => 'Sales Person'],
            ['name' => 'General Sales Three', 'job_title' => 'Sales Person'],
        ];

        $actionTemplates = [
            ['month' => 1, 'stage' => 'Pending', 'action_type' => 'Call', 'next_action_type' => 'Follow Up', 'description' => 'Initial outreach and qualification.'],
            ['month' => 3, 'stage' => 'Contacted', 'action_type' => 'Follow Up', 'next_action_type' => 'Meeting', 'description' => 'Followed up after first contact.'],
            ['month' => 6, 'stage' => 'Qualified', 'action_type' => 'Meeting', 'next_action_type' => 'Proposal', 'description' => 'Discussed needs and shortlisted options.'],
            ['month' => 9, 'stage' => 'Negotiation', 'action_type' => 'Proposal', 'next_action_type' => 'Closing', 'description' => 'Shared pricing and negotiated terms.'],
            ['month' => 12, 'stage' => 'Closed Won', 'action_type' => 'Closing', 'next_action_type' => null, 'description' => 'Final action logged for year-end testing.'],
        ];

        $seededActionCount = 0;
        $seededLeadCount = 0;

        foreach ($tenants as $tenant) {
            DB::transaction(function () use (
                $tenant,
                $stageBlueprints,
                $salesUsers,
                $actionTemplates,
                &$seededActionCount,
                &$seededLeadCount
            ): void {
                $stages = $this->ensureStages($tenant->id, $stageBlueprints);
                $tenantUsers = $this->ensureSalesUsers($tenant, $salesUsers);

                $leads = Lead::query()
                    ->where('tenant_id', $tenant->id)
                    ->orderBy('id')
                    ->get();

                if ($leads->isEmpty()) {
                    $this->command?->warn("Tenant {$tenant->domain} has no leads. Skipped.");
                    return;
                }

                $leadIds = $leads->pluck('id');

                LeadAction::query()
                    ->whereIn('lead_id', $leadIds)
                    ->where('description', 'like', '[Seeded General Localhost]%')
                    ->delete();

                $creatorId = User::query()
                    ->where('tenant_id', $tenant->id)
                    ->orderBy('id')
                    ->value('id');

                foreach ($leads as $leadIndex => $lead) {
                    $assignedUser = $tenantUsers[$leadIndex % count($tenantUsers)];
                    $leadActions = $this->buildLeadActions(
                        $tenant->id,
                        $lead,
                        $assignedUser,
                        $stages,
                        $actionTemplates,
                        $leadIndex
                    );

                    foreach ($leadActions as $payload) {
                        $action = new LeadAction();
                        $action->forceFill($payload);
                        $action->save();
                    }

                    $lastActionAt = LeadAction::query()
                        ->where('lead_id', $lead->id)
                        ->max('created_at');

                    $currentStage = $leadActions[array_key_last($leadActions)]['details']['stage_name'] ?? $lead->stage;

                    $lead->forceFill([
                        'assigned_to' => (string) $assignedUser->id,
                        'sales_person' => $assignedUser->name,
                        'stage' => $currentStage,
                        'created_by' => $lead->created_by ?: $creatorId,
                        'last_action_at' => $lastActionAt,
                        'last_contact' => $lastActionAt,
                    ])->saveQuietly();

                    $seededActionCount += count($leadActions);
                    $seededLeadCount++;
                }
            });
        }

        $this->command?->info(sprintf(
            'Seeded %d actions for %d leads across %d local general tenants.',
            $seededActionCount,
            $seededLeadCount,
            $tenants->count()
        ));
    }

    /**
     * @return array<string, Stage>
     */
    private function ensureStages(int $tenantId, array $stageBlueprints): array
    {
        $stages = [];

        foreach ($stageBlueprints as $blueprint) {
            $stage = Stage::query()->firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'name' => $blueprint['name'],
                ],
                $blueprint
            );

            $stages[$stage->name] = $stage;
        }

        return $stages;
    }

    /**
     * @return array<int, User>
     */
    private function ensureSalesUsers(Tenant $tenant, array $salesUsers): array
    {
        $users = [];

        foreach ($salesUsers as $index => $seedUser) {
            $email = sprintf(
                'general-sales-%d@%s.local',
                $index + 1,
                preg_replace('/[^a-z0-9]+/i', '-', strtolower($tenant->slug ?: 'tenant-' . $tenant->id))
            );

            $user = User::query()->firstOrCreate(
                ['email' => $email],
                [
                    'tenant_id' => $tenant->id,
                    'name' => $seedUser['name'],
                    'password' => Hash::make('password'),
                    'status' => 'Active',
                    'job_title' => $seedUser['job_title'],
                    'email_verified_at' => now(),
                ]
            );

            if ((int) $user->tenant_id !== (int) $tenant->id) {
                continue;
            }

            if ($user->job_title !== $seedUser['job_title'] || $user->status !== 'Active') {
                $user->forceFill([
                    'job_title' => $seedUser['job_title'],
                    'status' => 'Active',
                ])->saveQuietly();
            }

            $users[] = $user;
        }

        if ($users === []) {
            $fallbackUser = User::query()
                ->where('tenant_id', $tenant->id)
                ->orderBy('id')
                ->first();

            if ($fallbackUser) {
                $users[] = $fallbackUser;
            }
        }

        return $users;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildLeadActions(
        int $tenantId,
        Lead $lead,
        User $assignedUser,
        array $stages,
        array $actionTemplates,
        int $leadIndex
    ): array {
        $actions = [];
        $baseYear = 2024 + ($leadIndex % 3);
        $baseDay = min(28, 3 + $leadIndex);

        foreach ($actionTemplates as $templateIndex => $template) {
            $stage = $stages[$template['stage']] ?? null;
            if (!$stage) {
                continue;
            }

            $createdAt = Carbon::create($baseYear, $template['month'], $baseDay, 10 + ($templateIndex % 5), 15, 0, config('app.timezone'));

            $actions[] = [
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'user_id' => $assignedUser->id,
                'action_type' => $template['action_type'],
                'description' => '[Seeded General Localhost] ' . $template['description'],
                'stage_id_at_creation' => $stage->id,
                'next_action_type' => $template['next_action_type'],
                'details' => [
                    'seed_tag' => self::SEED_TAG,
                    'seeded_for' => 'general_localhost',
                    'sales_person_id' => $assignedUser->id,
                    'sales_person_name' => $assignedUser->name,
                    'stage_name' => $stage->name,
                    'action_sequence' => $templateIndex + 1,
                ],
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ];
        }

        return $actions;
    }
}
