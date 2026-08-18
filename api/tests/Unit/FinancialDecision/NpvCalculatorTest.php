<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\Dto\CashFlow;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Money;
use App\Services\FinancialDecision\NpvCalculator;
use PHPUnit\Framework\TestCase;

class NpvCalculatorTest extends TestCase
{
    public function test_handmade_fixture_matches_documented_npv_and_ratio(): void
    {
        $calculator = new NpvCalculator();
        $valuation = '2026-01-01';
        $cashFlows = [
            new CashFlow('200000', $valuation, 'initial_payment', 1),
            new CashFlow('400000', '2027-01-01', 'installment', 2),
            new CashFlow('400000', '2028-01-01', 'installment', 3),
        ];

        $result = $calculator->calculate($cashFlows, new FinancialAssumptions(
            discountRate: '0.10',
            valuationDate: $valuation,
            isExplicitlyConfigured: true,
        ));

        $expectedPv2 = Money::div('400000', '1.10');
        $expectedPv3 = Money::div('400000', Money::pow('1.10', '2'));
        $expectedNpv = Money::add(Money::add('200000', $expectedPv2), $expectedPv3);
        $expectedRatio = Money::div($expectedNpv, '1000000');

        $this->assertSame(0, Money::cmp($result->npv, $expectedNpv));
        $this->assertSame(0, Money::cmp(Money::div($result->npv, '1000000'), $expectedRatio));
        $this->assertCount(3, $result->trace);
        $this->assertSame(0, $result->trace[0]['days']);
        $this->assertSame(365, $result->trace[1]['days']);
        $this->assertSame(730, $result->trace[2]['days']);
    }

    public function test_zero_discount_rate_equals_sum_of_amounts(): void
    {
        $calculator = new NpvCalculator();
        $cashFlows = [
            new CashFlow('100', '2026-01-01', 'initial_payment', 1),
            new CashFlow('50', '2027-01-01', 'installment', 2),
        ];

        $result = $calculator->calculate($cashFlows, new FinancialAssumptions(
            discountRate: '0',
            valuationDate: '2026-01-01',
            isExplicitlyConfigured: true,
        ));

        $this->assertSame(0, Money::cmp($result->npv, '150'));
    }
}
