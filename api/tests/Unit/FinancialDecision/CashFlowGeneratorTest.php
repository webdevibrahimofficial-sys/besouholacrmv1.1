<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\CashFlowGenerator;
use App\Services\FinancialDecision\Money;
use PHPUnit\Framework\TestCase;

class CashFlowGeneratorTest extends TestCase
{
    public function test_ten_percent_down_and_thirty_six_months_closes_to_net(): void
    {
        $generator = new CashFlowGenerator();
        $result = $generator->generate('1000000', '2026-01-01', [
            ['type' => 'initial_payment', 'percentage' => '10', 'count' => 1],
            ['type' => 'installment', 'percentage' => '90', 'count' => 36, 'frequency' => 'monthly'],
        ]);

        $this->assertTrue($result['ok']);
        $total = '0';
        foreach ($result['cash_flows'] as $flow) {
            $total = Money::add($total, $flow->amount);
        }

        $this->assertSame(0, Money::cmp(Money::roundHalfUp($total), '1000000.00'));
        $this->assertSame('initial_payment', $result['cash_flows'][0]->type);
        $this->assertCount(37, $result['cash_flows']);
    }

    public function test_ninety_five_percent_allocation_is_incomplete(): void
    {
        $generator = new CashFlowGenerator();
        $result = $generator->generate('1000000', '2026-01-01', [
            ['type' => 'initial_payment', 'percentage' => '95', 'count' => 1],
        ]);

        $this->assertFalse($result['ok']);
        $this->assertSame('incomplete', $result['status']);
        $this->assertSame('schedule_does_not_balance', $result['reason']);
    }
}
