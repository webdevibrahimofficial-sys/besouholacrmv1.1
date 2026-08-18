<?php

namespace Tests\Unit;

use App\Support\StartCodeGenerator;
use PHPUnit\Framework\TestCase;

class StartCodeGeneratorTest extends TestCase
{
    public function test_numeric_start_uses_fallback_prefix(): void
    {
        $this->assertSame('ITM-0005', StartCodeGenerator::next([], '0005', 'ITM-'));
    }

    public function test_prefixed_start_increments_existing_codes(): void
    {
        $this->assertSame('CAT-0012', StartCodeGenerator::next(['CAT-0010', 'CAT-0011'], 'CAT-0001', 'CAT-'));
    }

    public function test_prefix_only_value_starts_at_one(): void
    {
        $this->assertSame('PRJ-0001', StartCodeGenerator::next([], 'PRJ', 'PRJ-'));
    }
}
