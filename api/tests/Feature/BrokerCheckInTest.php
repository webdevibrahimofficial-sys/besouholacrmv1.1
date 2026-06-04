<?php

namespace Tests\Feature;

use App\Models\Broker;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BrokerCheckInTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected Broker $broker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Broker Visit Tenant',
            'slug' => 'broker-visit-tenant',
            'status' => 'active',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Admin',
        ]);

        $this->broker = Broker::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Broker One',
            'status' => 'Active',
            'broker_type' => 'individual',
        ]);
    }

    public function test_authenticated_user_can_check_in_broker(): void
    {
        Sanctum::actingAs($this->user);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson("/api/brokers/{$this->broker->id}/check-in", [
                'check_in_date' => '2026-06-04T10:00:00Z',
                'lat' => 30.0444,
                'lng' => 31.2357,
                'address' => 'Cairo',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.type', 'broker')
            ->assertJsonPath('data.brokerId', $this->broker->id)
            ->assertJsonPath('data.brokerName', 'Broker One')
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('visits', [
            'tenant_id' => $this->tenant->id,
            'broker_id' => $this->broker->id,
            'broker_name' => 'Broker One',
            'type' => 'broker',
            'status' => 'pending',
        ]);
    }

    public function test_authenticated_user_can_check_out_broker(): void
    {
        Sanctum::actingAs($this->user);

        $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson("/api/brokers/{$this->broker->id}/check-in", [
                'check_in_date' => '2026-06-04T10:00:00Z',
                'lat' => 30.0444,
                'lng' => 31.2357,
                'address' => 'Cairo',
            ])
            ->assertCreated();

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson("/api/brokers/{$this->broker->id}/check-out", [
                'check_out_date' => '2026-06-04T11:00:00Z',
                'lat' => 30.0444,
                'lng' => 31.2357,
                'address' => 'Cairo',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.type', 'broker')
            ->assertJsonPath('data.status', 'accepted')
            ->assertJsonPath('data.durationMinutes', 60);

        $this->assertDatabaseHas('visits', [
            'tenant_id' => $this->tenant->id,
            'broker_id' => $this->broker->id,
            'status' => 'accepted',
        ]);
    }
}
