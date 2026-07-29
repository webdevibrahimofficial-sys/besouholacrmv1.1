<?php

namespace Tests\Unit;

use App\Services\MetaFieldMappingSuggester;
use PHPUnit\Framework\TestCase;

class MetaFieldMappingSuggesterTest extends TestCase
{
    public function test_suggests_mapping_for_common_meta_field_keys(): void
    {
        $suggester = new MetaFieldMappingSuggester();

        $mapping = $suggester->suggestFromQuestions([
            ['key' => 'full_name', 'label' => 'Full Name'],
            ['key' => 'email', 'label' => 'Email Address'],
            ['key' => 'phone_number', 'label' => 'Phone'],
            ['key' => 'utm_source', 'label' => 'UTM Source'],
        ]);

        $this->assertSame([
            'full_name' => 'name',
            'email' => 'email',
            'phone_number' => 'phone',
            'utm_source' => 'utm_source',
        ], $mapping);
    }

    public function test_matches_fields_from_labels_when_keys_are_custom(): void
    {
        $suggester = new MetaFieldMappingSuggester();

        $mapping = $suggester->suggestFromQuestions([
            ['key' => 'q_1', 'label' => 'Your mobile number'],
            ['key' => 'q_2', 'label' => 'Comments'],
        ]);

        $this->assertSame('phone', $mapping['q_1'] ?? null);
        $this->assertSame('notes', $mapping['q_2'] ?? null);
    }

    public function test_ignores_unrecognized_questions(): void
    {
        $suggester = new MetaFieldMappingSuggester();

        $mapping = $suggester->suggestFromQuestions([
            ['key' => 'favorite_color', 'label' => 'Favorite Color'],
        ]);

        $this->assertSame([], $mapping);
    }
}
