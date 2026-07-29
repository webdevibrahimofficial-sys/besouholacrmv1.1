<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('website_settings', function (Blueprint $table) {
            $table->string('website_url')->nullable()->after('address');
            $table->json('nav_links')->nullable()->after('contact_page_content');
            $table->string('nav_cta_text')->nullable()->after('nav_links');
            $table->string('nav_cta_href')->nullable()->after('nav_cta_text');
            $table->json('footer_sections')->nullable()->after('nav_cta_href');
            $table->json('footer_quick_links')->nullable()->after('footer_sections');
            $table->string('footer_tagline')->nullable()->after('footer_quick_links');
            $table->text('footer_description')->nullable()->after('footer_tagline');
            $table->json('whatsapp_float')->nullable()->after('footer_description');
            $table->json('pages_seo')->nullable()->after('whatsapp_float');
        });
    }

    public function down(): void
    {
        Schema::table('website_settings', function (Blueprint $table) {
            $table->dropColumn([
                'website_url',
                'nav_links',
                'nav_cta_text',
                'nav_cta_href',
                'footer_sections',
                'footer_quick_links',
                'footer_tagline',
                'footer_description',
                'whatsapp_float',
                'pages_seo',
            ]);
        });
    }
};
