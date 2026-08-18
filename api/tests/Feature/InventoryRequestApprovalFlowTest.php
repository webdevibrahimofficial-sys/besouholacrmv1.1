<?php

namespace Tests\Feature;

use App\Models\InventoryRequest;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryRequestApprovalFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_manager_cannot_approve_inventory_request(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'inventory-request-approval']);
        $salesUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $requestModel = InventoryRequest::create([
            'tenant_id' => $tenant->id,
            'product' => 'Printer',
            'quantity' => 1,
            'status' => 'PendingApproval',
        ]);

        Sanctum::actingAs($salesUser);

        $response = $this->withoutMiddleware()->putJson("/api/inventory-requests/{$requestModel->id}", [
            'status' => 'Approved',
        ]);

        $response->assertStatus(403);
        $requestModel->refresh();
        $this->assertSame('PendingApproval', $requestModel->status);
    }
}
