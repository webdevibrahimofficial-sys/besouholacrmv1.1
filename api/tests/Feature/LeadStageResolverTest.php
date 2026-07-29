<?php

namespace Tests\Feature;

use App\Models\Stage;
use App\Models\Tenant;
use App\Support\LeadStageResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeadStageResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_stages_are_allowed_without_stage_settings(): void
    {
        $tenant = Tenant::factory()->create();

        $this->assertSame('New Lead', LeadStageResolver::resolve($tenant->id, null, true));
        $this->assertSame('New Lead', LeadStageResolver::resolve($tenant->id, 'new', true));
        $this->assertSame('Cold Calls', LeadStageResolver::resolve($tenant->id, 'cold calls', true));
    }

    public function test_tenant_pipeline_stage_is_allowed_and_unknown_stage_is_rejected(): void
    {
        $tenant = Tenant::factory()->create();

        Stage::create([
            'tenant_id' => $tenant->id,
            'name' => 'Pending',
            'name_ar' => 'معلق',
            'type' => 'follow_up',
            'order' => 1,
            'color' => '#F59E0B',
            'icon' => 'Clock',
        ]);

        $this->assertSame('Pending', LeadStageResolver::resolve($tenant->id, 'Pending', true));
        $this->assertSame('Pending', LeadStageResolver::resolve($tenant->id, 'معلق', true));
        $this->assertNull(LeadStageResolver::resolve($tenant->id, 'test test', true));
    }
}
