<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('campaigns', function (Blueprint $table) {
            if (! Schema::hasColumn('campaigns', 'project_id')) {
                $table->unsignedBigInteger('project_id')->nullable()->after('agency_id');
                $table->index('project_id');
            }
            if (! Schema::hasColumn('campaigns', 'item_id')) {
                $table->unsignedBigInteger('item_id')->nullable()->after('project_id');
                $table->index('item_id');
            }
        });

        if (Schema::hasTable('whatsapp_message_attributions')
            && ! Schema::hasColumn('whatsapp_message_attributions', 'campaign_meta_id')) {
            Schema::table('whatsapp_message_attributions', function (Blueprint $table) {
                $table->string('campaign_meta_id')->nullable()->after('campaign_name');
            });
        }
    }

    public function down(): void
    {
        Schema::table('campaigns', function (Blueprint $table) {
            if (Schema::hasColumn('campaigns', 'item_id')) {
                $table->dropColumn('item_id');
            }
            if (Schema::hasColumn('campaigns', 'project_id')) {
                $table->dropColumn('project_id');
            }
        });

        if (Schema::hasTable('whatsapp_message_attributions')
            && Schema::hasColumn('whatsapp_message_attributions', 'campaign_meta_id')) {
            Schema::table('whatsapp_message_attributions', function (Blueprint $table) {
                $table->dropColumn('campaign_meta_id');
            });
        }
    }
};
