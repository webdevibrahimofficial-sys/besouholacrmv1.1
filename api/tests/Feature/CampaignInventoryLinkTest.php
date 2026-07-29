<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\Item;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CampaignInventoryLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_real_estate_tenant_links_campaign_to_project(): void
    {
        $tenant = Tenant::factory()->create(['company_type' => 'real estate']);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);
        $project = Project::create([
            'tenant_id' => $tenant->id,
            'name' => 'Compound A',
        ]);
        $campaign = Campaign::create([
            'tenant_id' => $tenant->id,
            'name' => 'Meta Camp',
            'provider' => 'meta',
            'meta_id' => 'META_CAMP_1',
            'status' => 'ACTIVE',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/campaigns/{$campaign->id}/link-inventory", [
            'project_id' => $project->id,
        ])->assertOk()
            ->assertJsonPath('data.projectId', $project->id)
            ->assertJsonPath('data.needsInventoryLink', false);

        $this->assertDatabaseHas('campaigns', [
            'id' => $campaign->id,
            'project_id' => $project->id,
            'item_id' => null,
        ]);
    }

    public function test_general_tenant_links_campaign_to_item(): void
    {
        $tenant = Tenant::factory()->create(['company_type' => 'general']);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Product X',
            'code' => 'ITEM-X',
        ]);
        $campaign = Campaign::create([
            'tenant_id' => $tenant->id,
            'name' => 'Meta Camp G',
            'provider' => 'meta',
            'meta_id' => 'META_CAMP_2',
            'status' => 'ACTIVE',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/campaigns/{$campaign->id}/link-inventory", [
            'item_id' => $item->id,
        ])->assertOk()
            ->assertJsonPath('data.itemId', $item->id)
            ->assertJsonPath('data.needsInventoryLink', false);
    }

    public function test_campaign_index_exposes_needs_inventory_link(): void
    {
        $tenant = Tenant::factory()->create(['company_type' => 'general']);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);
        Campaign::create([
            'tenant_id' => $tenant->id,
            'name' => 'Unlinked Meta',
            'provider' => 'meta',
            'meta_id' => 'META_CAMP_3',
            'status' => 'ACTIVE',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/campaigns')
            ->assertOk()
            ->assertJsonFragment(['needsInventoryLink' => true]);
    }
}
