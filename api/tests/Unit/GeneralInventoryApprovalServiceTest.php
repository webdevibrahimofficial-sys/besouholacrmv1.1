<?php

namespace Tests\Unit;

use App\Models\InventoryRequest;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GeneralInventory\GeneralInventoryApprovalService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class GeneralInventoryApprovalServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_manager_cannot_approve_request(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'approval-non-manager']);
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

        $service = app(GeneralInventoryApprovalService::class);

        $this->expectException(AuthorizationException::class);
        $service->prepareUpdate($requestModel, ['status' => 'Approved'], $salesUser);
    }

    public function test_approved_request_requires_pending_approval_for_financial_changes(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'approval-reapproval']);
        $manager = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Operation Manager',
        ]);
        $requestModel = InventoryRequest::create([
            'tenant_id' => $tenant->id,
            'product' => 'Router',
            'quantity' => 1,
            'status' => 'Approved',
            'meta_data' => [
                'price' => 1000,
                'total' => 1000,
            ],
        ]);

        $service = app(GeneralInventoryApprovalService::class);

        try {
            $service->prepareUpdate($requestModel, ['quantity' => 2], $manager);
            $this->fail('Expected validation exception for financial change without re-approval.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }

        $prepared = $service->prepareUpdate($requestModel, [
            'quantity' => 2,
            'status' => 'pending_approval',
        ], $manager);

        $this->assertSame('PendingApproval', $prepared['next_status']);
        $this->assertTrue((bool) ($prepared['data']['meta_data']['approval']['reapproval_required'] ?? false));
    }

    public function test_manager_can_reject_request_with_reason(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'approval-reject']);
        $manager = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Operation Manager',
        ]);
        $requestModel = InventoryRequest::create([
            'tenant_id' => $tenant->id,
            'product' => 'Switch',
            'quantity' => 1,
            'status' => 'PendingApproval',
        ]);

        $service = app(GeneralInventoryApprovalService::class);
        $prepared = $service->prepareUpdate($requestModel, [
            'status' => 'Rejected',
            'rejection_reason' => 'Budget not approved',
        ], $manager);

        $this->assertSame('Rejected', $prepared['next_status']);
        $this->assertSame('Budget not approved', $prepared['data']['meta_data']['approval']['rejection_reason'] ?? null);
    }
}
