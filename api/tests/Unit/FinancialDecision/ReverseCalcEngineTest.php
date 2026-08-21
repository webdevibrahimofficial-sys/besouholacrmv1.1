<?php

namespace Tests\Unit\FinancialDecision;

use App\Models\User;
use App\Services\FinancialDecision\Adapters\FinancialInputAdapter;
use App\Services\FinancialDecision\CashFlowGenerator;
use App\Services\FinancialDecision\DecisionEngine;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialOffer;
use App\Services\FinancialDecision\Dto\FinancialPolicy;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;
use App\Services\FinancialDecision\MetricsCalculator;
use App\Services\FinancialDecision\Money;
use App\Services\FinancialDecision\NpvCalculator;
use App\Services\FinancialDecision\ReverseCalcEngine;
use PHPUnit\Framework\TestCase;

class ReverseCalcEngineTest extends TestCase
{
    public function test_max_discount_respects_standard_policy_ceiling_when_npv_allows(): void
    {
        $engine = $this->engineWithStubAdapter();
        $user = new User();
        $user->id = 1;
        $user->tenant_id = 1;

        $request = new StructuredFinancialRequest(
            intent: 'max_discount',
            grossAmount: '1000000',
            downPaymentPercentage: '20',
            durationMonths: 12,
            frequency: 'monthly',
            mode: 'max_discount',
        );

        $max = $engine->findMaxDiscount(
            $user,
            $request,
            $this->assumptions(),
            $this->policy(),
            '2026-01-01',
            ['approved', 'approved_with_warning']
        );

        $this->assertNotNull($max);
        $this->assertSame(0, Money::cmp(Money::roundHalfUp($max, 2), '5.00'));
    }

    public function test_max_discount_with_manager_can_exceed_standard_cap(): void
    {
        $engine = $this->engineWithStubAdapter();
        $user = new User();
        $user->id = 1;
        $user->tenant_id = 1;

        $request = new StructuredFinancialRequest(
            intent: 'max_discount',
            grossAmount: '1000000',
            downPaymentPercentage: '20',
            durationMonths: 12,
            frequency: 'monthly',
            mode: 'max_discount',
        );

        $maxManager = $engine->findMaxDiscount(
            $user,
            $request,
            $this->assumptions(),
            $this->policy(),
            '2026-01-01',
            ['approved', 'approved_with_warning', 'manager_approval_required']
        );

        $this->assertNotNull($maxManager);
        $this->assertSame(0, Money::cmp(Money::roundHalfUp($maxManager, 2), '8.00'));
    }

    public function test_recommendations_are_backend_owned_codes_only(): void
    {
        $engine = $this->engineWithStubAdapter();
        $user = new User();
        $user->id = 1;
        $user->tenant_id = 1;

        $request = new StructuredFinancialRequest(
            grossAmount: '1000000',
            discountPercentage: '9',
            downPaymentPercentage: '20',
            durationMonths: 12,
            frequency: 'monthly',
        );

        $recs = $engine->recommend($user, $request, $this->assumptions(), $this->policy(), '2026-01-01');
        $codes = array_column($recs, 'code');

        $this->assertContains('max_discount_percentage', $codes);
        $this->assertContains('max_discount_percentage_with_manager', $codes);
        foreach ($recs as $item) {
            $this->assertArrayHasKey('value', $item);
            $this->assertArrayHasKey('unit', $item);
            $this->assertArrayHasKey('target_decision', $item);
            $this->assertSame('percent', $item['unit']);
        }
    }

    private function engineWithStubAdapter(): ReverseCalcEngine
    {
        $adapter = new class implements FinancialInputAdapter
        {
            public function resolve(User $user, StructuredFinancialRequest $request, string $startDate): array
            {
                $gross = Money::of($request->grossAmount ?? '1000000');
                $discountPct = Money::of($request->discountPercentage ?? '0');
                $discountAmount = Money::div(Money::mul($gross, $discountPct), '100');
                $net = Money::sub($gross, $discountAmount);
                $downPct = Money::of($request->downPaymentPercentage ?? '20');
                $months = $request->durationMonths ?? 12;

                $offer = new FinancialOffer(
                    grossAmount: $gross,
                    discountAmount: $discountAmount,
                    discountPercentage: $discountPct,
                    netAmount: $net,
                    currency: 'EGP',
                    startDate: $startDate,
                );

                $allocations = [
                    ['type' => 'initial_payment', 'percentage' => $downPct, 'count' => 1],
                    [
                        'type' => 'installment',
                        'amount' => Money::sub($net, Money::div(Money::mul($net, $downPct), '100')),
                        'count' => $months,
                        'frequency' => $request->frequency ?? 'monthly',
                    ],
                ];

                return [
                    'ok' => true,
                    'status' => null,
                    'reasons' => [],
                    'offer' => $offer,
                    'allocations' => $allocations,
                    'source' => new FinancialInputSource('user_utterance', null, 'current', 'high', 'test', []),
                    'evaluable' => null,
                ];
            }
        };

        return new ReverseCalcEngine(
            $adapter,
            new CashFlowGenerator(),
            new NpvCalculator(),
            new MetricsCalculator(),
            new DecisionEngine(),
        );
    }

    private function assumptions(): FinancialAssumptions
    {
        return new FinancialAssumptions(
            discountRate: '0.12',
            valuationDate: '2026-01-01',
            isExplicitlyConfigured: true,
        );
    }

    private function policy(): FinancialPolicy
    {
        return new FinancialPolicy(
            minimumNpvRatio: '0.80',
            minimumInitialCollectionPercentage: '10',
            maximumDiscountPercentage: '5',
            managerMaximumDiscountPercentage: '8',
            maximumDurationMonths: 96,
            isExplicitlyConfigured: true,
            versionId: 1,
            versionNumber: 1,
        );
    }
}
