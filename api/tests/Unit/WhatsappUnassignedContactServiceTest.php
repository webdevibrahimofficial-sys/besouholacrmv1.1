<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Models\WhatsappMessage;
use App\Models\WhatsappUnassignedContact;
use App\Services\Whatsapp\WhatsappLidResolutionService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsappUnassignedContactServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_outbound_message_does_not_overwrite_customer_name_or_first_body(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(WhatsappUnassignedContactService::class);

        $service->recordPendingMessage(
            $tenant->id,
            '201093211958',
            'lil',
            'hello from customer',
            now()->subMinute(),
            true,
            false,
            false
        );

        $service->recordPendingMessage(
            $tenant->id,
            '201093211958',
            'Ibrahim',
            'reply from agent',
            now(),
            true,
            false,
            true
        );

        $contact = WhatsappUnassignedContact::query()
            ->where('tenant_id', $tenant->id)
            ->where('phone', '201093211958')
            ->first();

        $this->assertNotNull($contact);
        $this->assertSame('lil', $contact->push_name);
        $this->assertSame('hello from customer', $contact->first_message_body);
        $this->assertSame('reply from agent', $contact->last_message_body);
        $this->assertSame(2, $contact->messages_count);
    }

    public function test_older_history_message_replaces_first_preview(): void
    {
        $tenant = Tenant::factory()->create();
        $service = app(WhatsappUnassignedContactService::class);

        $service->recordPendingMessage(
            $tenant->id,
            '201095204105',
            'Trainer Mona Arafat',
            'later message',
            now(),
            true,
            false,
            false
        );

        $service->recordPendingMessage(
            $tenant->id,
            '201095204105',
            'Trainer Mona Arafat',
            'first message',
            now()->subHour(),
            true,
            false,
            false
        );

        $contact = WhatsappUnassignedContact::query()
            ->where('tenant_id', $tenant->id)
            ->where('phone', '201095204105')
            ->first();

        $this->assertSame('first message', $contact->first_message_body);
        $this->assertSame('later message', $contact->last_message_body);
    }

    public function test_backfill_copies_oldest_stored_message_onto_existing_contacts(): void
    {
        $tenant = Tenant::factory()->create();

        $contact = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201093211958',
            'push_name' => 'lil',
            'first_message_at' => now()->subDays(2),
            'last_message_at' => now(),
            'last_message_body' => 'latest reply',
            'first_message_body' => null,
            'messages_count' => 3,
            'status' => 'pending',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201093211958',
            'to' => '201099999999',
            'type' => 'text',
            'status' => 'received',
            'message_id' => 'wamid.old-first',
            'body' => 'first hello',
            'created_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'direction' => 'outbound',
            'from' => '201099999999',
            'to' => '201093211958',
            'type' => 'text',
            'status' => 'sent',
            'message_id' => 'wamid.old-last',
            'body' => 'latest reply',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $updated = app(WhatsappUnassignedContactService::class)
            ->backfillMissingFirstMessages($tenant->id);

        $this->assertSame(1, $updated);
        $this->assertSame('first hello', $contact->fresh()->first_message_body);
        $this->assertSame('latest reply', $contact->fresh()->last_message_body);
    }

    public function test_backfill_restores_customer_name_when_overwritten_by_agent(): void
    {
        $tenant = Tenant::factory()->create();
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Ibrahim',
        ]);

        $contact = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201093211958',
            'push_name' => 'Ibrahim',
            'first_message_at' => now()->subDay(),
            'last_message_at' => now(),
            'last_message_body' => 'reply from agent',
            'messages_count' => 2,
            'status' => 'pending',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201093211958',
            'to' => '201099999999',
            'type' => 'text',
            'status' => 'received',
            'message_id' => 'wamid.name-in',
            'body' => 'hello from customer',
            'raw' => [
                'from_me' => false,
                'pushName' => 'lil',
            ],
        ]);

        WhatsappContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201093211958',
            'push_name' => 'lil',
            'name' => 'lil',
        ]);

        $updated = app(WhatsappUnassignedContactService::class)
            ->backfillMissingCustomerNames($tenant->id);

        $this->assertSame(1, $updated);
        $this->assertSame('lil', $contact->fresh()->push_name);
    }

    public function test_backfill_does_not_replace_an_existing_customer_name(): void
    {
        $tenant = Tenant::factory()->create();
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Ibrahim',
        ]);

        $contact = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201095204105',
            'push_name' => 'Trainer Mona Arafat',
            'status' => 'pending',
        ]);

        $updated = app(WhatsappUnassignedContactService::class)
            ->backfillMissingCustomerNames($tenant->id);

        $this->assertSame(0, $updated);
        $this->assertSame('Trainer Mona Arafat', $contact->fresh()->push_name);
    }

    public function test_backfill_restores_empty_name_for_unresolved_lid_from_contact_store(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '120569026592815',
            'is_unresolved_lid' => true,
            'push_name' => null,
            'status' => 'pending',
        ]);

        WhatsappContact::create([
            'tenant_id' => $tenant->id,
            'lid' => '120569026592815',
            'push_name' => 'lil',
            'name' => 'lil',
        ]);

        $updated = app(WhatsappUnassignedContactService::class)
            ->backfillMissingCustomerNames($tenant->id);

        $this->assertSame(1, $updated);
        $this->assertDatabaseHas('whatsapp_unassigned_contacts', [
            'tenant_id' => $tenant->id,
            'phone' => '120569026592815',
            'push_name' => 'lil',
        ]);
    }

    public function test_backfill_does_not_clear_name_when_no_customer_name_is_found(): void
    {
        $tenant = Tenant::factory()->create();
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Ibrahim',
        ]);

        $contact = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201030691804',
            'push_name' => 'Ibrahim',
            'status' => 'pending',
        ]);

        $updated = app(WhatsappUnassignedContactService::class)
            ->backfillMissingCustomerNames($tenant->id);

        $this->assertSame(0, $updated);
        $this->assertSame('Ibrahim', $contact->fresh()->push_name);
    }

    public function test_known_lid_is_recorded_against_existing_phone_contact(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappContact::create([
            'tenant_id' => $tenant->id,
            'lid' => '120569026592815',
            'phone' => '201005125100',
            'push_name' => 'مهندس عبد الحميد',
        ]);

        $existing = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201005125100',
            'push_name' => 'مهندس عبد الحميد',
            'messages_count' => 190,
            'status' => 'pending',
        ]);

        app(WhatsappUnassignedContactService::class)->recordPendingMessage(
            $tenant->id,
            '120569026592815',
            'مهندس عبد الحميد',
            '...',
            now(),
            true,
            true,
            false
        );

        $this->assertSame(1, WhatsappUnassignedContact::query()->where('tenant_id', $tenant->id)->count());
        $this->assertSame(191, $existing->fresh()->messages_count);
        $this->assertFalse((bool) $existing->fresh()->is_unresolved_lid);
    }

    public function test_merge_combines_lid_row_into_resolved_phone_row(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappContact::create([
            'tenant_id' => $tenant->id,
            'lid' => '120569026592815',
            'phone' => '201005125100',
            'push_name' => 'مهندس عبد الحميد',
        ]);

        WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '120569026592815',
            'is_unresolved_lid' => true,
            'push_name' => 'مهندس عبد الحميد',
            'messages_count' => 3,
            'status' => 'pending',
        ]);

        $phoneRow = WhatsappUnassignedContact::create([
            'tenant_id' => $tenant->id,
            'phone' => '201005125100',
            'push_name' => 'مهندس عبد الحميد',
            'messages_count' => 190,
            'status' => 'pending',
        ]);

        $updated = app(WhatsappLidResolutionService::class)
            ->mergeKnownUnassignedLidDuplicates($tenant->id);

        $this->assertSame(1, $updated);
        $this->assertSame(1, WhatsappUnassignedContact::query()->where('tenant_id', $tenant->id)->count());
        $this->assertSame(193, $phoneRow->fresh()->messages_count);
        $this->assertDatabaseMissing('whatsapp_unassigned_contacts', [
            'tenant_id' => $tenant->id,
            'phone' => '120569026592815',
        ]);
    }
}
