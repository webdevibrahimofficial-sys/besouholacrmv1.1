<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('item_categories')
            ->whereIn('applies_to', ['Product', 'product', 'products'])
            ->update(['applies_to' => 'Products']);

        DB::table('item_categories')
            ->whereIn('applies_to', ['Service', 'service', 'services', 'Subscription', 'Package'])
            ->update(['applies_to' => 'Services']);
    }

    public function down(): void
    {
        DB::table('item_categories')
            ->where('applies_to', 'Products')
            ->update(['applies_to' => 'Product']);

        DB::table('item_categories')
            ->where('applies_to', 'Services')
            ->update(['applies_to' => 'Service']);
    }
};
