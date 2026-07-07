<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->string('group_action_status', 32)->default('pending')->after('status')->index();
            $table->string('group_action_reason', 64)->nullable()->after('group_action_status');
            $table->text('group_action_message')->nullable()->after('group_action_reason');
            $table->string('last_target_group_jid', 191)->nullable()->after('group_action_message');
            $table->string('last_target_group_name')->nullable()->after('last_target_group_jid');
            $table->timestamp('last_add_attempt_at')->nullable()->after('last_target_group_name');
            $table->timestamp('invite_sent_at')->nullable()->after('last_add_attempt_at');
            $table->text('invite_link')->nullable()->after('invite_sent_at');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->dropIndex(['group_action_status']);
            $table->dropColumn([
                'group_action_status',
                'group_action_reason',
                'group_action_message',
                'last_target_group_jid',
                'last_target_group_name',
                'last_add_attempt_at',
                'invite_sent_at',
                'invite_link',
            ]);
        });
    }
};
