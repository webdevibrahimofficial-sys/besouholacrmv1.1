<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class MetaLeadFormSuggestMappingTest extends TestCase
{
    use RefreshDatabase;

    public function test_suggest_mapping_returns_detected_fields_from_form_questions(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_form_suggest',
            'name' => 'Tenant Form Suggest',
            'slug' => 'tenant-form-suggest',
            'status' => 'active',
        ]);

        $user = User::factory()->create(['tenant_id' => $tenant->id]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-form-suggest',
            'user_access_token' => 'token',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-form-suggest',
            'page_name' => 'Suggest Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->once()
            ->with('/form-123', Mockery::on(function (array $params) {
                return ($params['fields'] ?? null) === 'id,name,questions'
                    && ($params['access_token'] ?? null) === 'page-token';
            }))
            ->andReturn([
                'id' => 'form-123',
                'name' => 'Lead Form',
                'questions' => [
                    ['key' => 'full_name', 'label' => 'Full Name'],
                    ['key' => 'email', 'label' => 'Email'],
                    ['key' => 'phone_number', 'label' => 'Phone'],
                ],
            ]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $response = $this->actingAs($user)->getJson('/api/auth/meta/forms/form-123/suggest-mapping');

        $response->assertOk()
            ->assertJsonPath('form_id', 'form-123')
            ->assertJsonPath('suggested_mapping.full_name', 'name')
            ->assertJsonPath('suggested_mapping.email', 'email')
            ->assertJsonPath('suggested_mapping.phone_number', 'phone');
    }
}
