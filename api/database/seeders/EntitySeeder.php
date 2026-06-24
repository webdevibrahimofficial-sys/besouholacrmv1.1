<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Entity;

class EntitySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach (Entity::supportedKeys() as $key) {
            Entity::firstOrCreate(['key' => $key]);
        }
    }
}
