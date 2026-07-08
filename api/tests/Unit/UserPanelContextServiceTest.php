<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\UserPanelContextService;
use Mockery;
use Tests\TestCase;

class UserPanelContextServiceTest extends TestCase
{
  protected function tearDown(): void
  {
    Mockery::close();
    parent::tearDown();
  }

  public function test_system_admin_without_impersonation_uses_system_panel(): void
  {
    $service = new UserPanelContextService();
    $user = new User(['is_super_admin' => true]);

    $payload = $service->buildPayload($user, null, null);

    $this->assertTrue($payload['is_system_admin']);
    $this->assertSame('system', $payload['panel_mode']);
    $this->assertSame('super_admin', $payload['subscription_plan']);
    $this->assertNull($service->resolveTenantForProfile($user, null, null));
  }

  public function test_system_admin_with_impersonation_uses_tenant_panel(): void
  {
    $service = new UserPanelContextService();
    $user = new User(['is_super_admin' => true]);
    $impersonation = ['active' => true, 'tenant_id' => 5];

    $payload = $service->buildPayload($user, null, $impersonation);

    $this->assertSame('tenant', $payload['panel_mode']);
    $this->assertNull($payload['subscription_plan']);
  }
}
