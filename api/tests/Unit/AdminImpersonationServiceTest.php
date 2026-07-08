<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Models\User;
use App\Services\AdminImpersonationService;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AdminImpersonationServiceTest extends TestCase
{
    public function test_current_for_support_token_returns_null_when_impersonation_table_is_missing(): void
    {
        Schema::shouldReceive('connection')->once()->with('landlord')->andReturnSelf();
        Schema::shouldReceive('hasTable')->once()->with('admin_impersonation_sessions')->andReturn(false);

        $service = new AdminImpersonationService();
        $token = new PersonalAccessToken(['id' => 112]);

        $this->assertNull($service->currentForSupportToken($token));
    }

    public function test_start_throws_service_unavailable_when_impersonation_table_is_missing(): void
    {
        Schema::shouldReceive('connection')->once()->with('landlord')->andReturnSelf();
        Schema::shouldReceive('hasTable')->once()->with('admin_impersonation_sessions')->andReturn(false);

        $service = new AdminImpersonationService();

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Support access is unavailable until the impersonation storage migration is applied.');

        $service->start(new User(), new Tenant(), request(), []);
    }
}
