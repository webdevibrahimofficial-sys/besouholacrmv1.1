<?php

namespace Tests\Feature;

use App\Models\AdminImpersonationSession;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class SuperAdminImpersonationTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $systemTenant;
    protected Tenant $tenant;
    protected Tenant $otherTenant;
    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->systemTenant = Tenant::factory()->create([
            'slug' => 'system-panel',
            'status' => 'active',
        ]);

        $this->tenant = Tenant::factory()->create([
            'slug' => 'tenant-one',
            'status' => 'active',
        ]);

        $this->otherTenant = Tenant::factory()->create([
            'slug' => 'tenant-two',
            'status' => 'active',
        ]);

        $this->superAdmin = User::factory()->create([
            'tenant_id' => $this->systemTenant->id,
            'is_super_admin' => true,
        ]);

        User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => false,
            'status' => 'Active',
        ]);

        User::factory()->create([
            'tenant_id' => $this->otherTenant->id,
            'is_super_admin' => false,
            'status' => 'Active',
        ]);

        setPermissionsTeamId($this->systemTenant->id);

        $permission = Permission::findOrCreate('system.tenants.impersonate', 'web');
        $permission->tenant_id = $this->systemTenant->id;
        $permission->save();

        $this->superAdmin->givePermissionTo($permission);
    }

    public function test_non_super_admin_cannot_start_support_access(): void
    {
        $normalUser = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => false,
        ]);

        Sanctum::actingAs($normalUser);

        $this->postJson("/api/super-admin/tenants/{$this->tenant->id}/impersonation", [
            'mode' => 'support_access',
        ])->assertStatus(403);
    }

    public function test_super_admin_can_start_support_access_session(): void
    {
        setPermissionsTeamId(null);
        Sanctum::actingAs($this->superAdmin);

        $response = $this->postJson("/api/super-admin/tenants/{$this->tenant->id}/impersonation", [
            'mode' => 'support_access',
            'reason' => 'QA check',
        ]);

        $response->assertOk()
            ->assertJsonPath('session.tenant_id', $this->tenant->id)
            ->assertJsonPath('session.mode', 'support_access');

        $this->assertDatabaseHas('admin_impersonation_sessions', [
            'admin_user_id' => $this->superAdmin->id,
            'tenant_id' => $this->tenant->id,
            'status' => 'active',
        ], 'landlord');
    }

    public function test_bridge_token_can_be_exchanged_only_once(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $start = $this->postJson("/api/super-admin/tenants/{$this->tenant->id}/impersonation", [
            'mode' => 'support_access',
        ])->assertOk();

        $bridgeToken = $start->json('bridge_token');
        $tenantUrl = "http://{$this->tenant->slug}.localhost";

        $first = $this->postJson("{$tenantUrl}/api/impersonation/exchange", [
            'token' => $bridgeToken,
        ]);

        $first->assertOk()
            ->assertJsonPath('impersonation.active', true);

        $second = $this->postJson("{$tenantUrl}/api/impersonation/exchange", [
            'token' => $bridgeToken,
        ]);

        $second->assertStatus(401);
    }

    public function test_tenant_current_endpoint_returns_active_session_after_exchange(): void
    {
        $token = $this->issueSupportToken();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("http://{$this->tenant->slug}.localhost/api/impersonation/current")
            ->assertOk()
            ->assertJsonPath('active', true)
            ->assertJsonPath('session.tenant_id', $this->tenant->id);
    }

    public function test_tenant_current_endpoint_returns_inactive_when_no_session_exists(): void
    {
        $token = $this->admin->createToken('auth_token')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("http://{$this->tenant->slug}.localhost/api/impersonation/current")
            ->assertOk()
            ->assertJsonPath('active', false)
            ->assertJsonPath('session', null);
    }

    public function test_tenant_exit_endpoint_ends_session(): void
    {
        [$token, $sessionId] = $this->issueSupportToken(true);

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->deleteJson("http://{$this->tenant->slug}.localhost/api/impersonation/current");

        $response->assertOk()
            ->assertJsonPath('token', fn ($value) => is_string($value) && strlen($value) > 20);

        $this->assertDatabaseHas('admin_impersonation_sessions', [
            'id' => $sessionId,
            'status' => 'ended',
            'ended_reason' => 'tenant_workspace_exit',
        ], 'landlord');
    }

    public function test_tenant_mismatch_is_rejected(): void
    {
        $token = $this->issueSupportToken();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("http://{$this->otherTenant->slug}.localhost/api/company-info")
            ->assertStatus(403);
    }

    public function test_dangerous_actions_are_blocked_during_support_access(): void
    {
        $token = $this->issueSupportToken();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson("http://{$this->tenant->slug}.localhost/api/exports", [])
            ->assertStatus(403)
            ->assertJsonPath('code', 'IMPERSONATION_ACTION_RESTRICTED');
    }

    protected function issueSupportToken(bool $withSessionId = false): array|string
    {
        Sanctum::actingAs($this->superAdmin);

        $start = $this->postJson("/api/super-admin/tenants/{$this->tenant->id}/impersonation", [
            'mode' => 'support_access',
            'reason' => 'Support test',
        ])->assertOk();

        $bridgeToken = $start->json('bridge_token');
        $sessionId = $start->json('session.id');

        $exchange = $this->postJson("http://{$this->tenant->slug}.localhost/api/impersonation/exchange", [
            'token' => $bridgeToken,
        ])->assertOk();

        $token = $exchange->json('token');

        return $withSessionId ? [$token, $sessionId] : $token;
    }
}
