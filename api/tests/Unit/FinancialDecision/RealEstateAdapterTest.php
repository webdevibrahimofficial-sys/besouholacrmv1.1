<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\Adapters\RealEstateAdapter;
use PHPUnit\Framework\TestCase;

class RealEstateAdapterTest extends TestCase
{
    public function test_adapter_is_read_only_and_does_not_touch_contract_collections(): void
    {
        $path = dirname(__DIR__, 3).'/app/Services/FinancialDecision/Adapters/RealEstateAdapter.php';
        $contents = (string) file_get_contents($path);

        $this->assertStringNotContainsString('cc_', $contents);
        $this->assertStringNotContainsString('->save(', $contents);
        $this->assertStringNotContainsString('->update(', $contents);
        $this->assertStringNotContainsString('::create(', $contents);
        $this->assertStringNotContainsString('::insert(', $contents);
        $this->assertTrue(class_exists(RealEstateAdapter::class));
    }
}
