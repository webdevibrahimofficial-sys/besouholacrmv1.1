<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\DecisionEngine;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\FinancialPolicy;
use PHPUnit\Framework\TestCase;

class DecisionEngineTest extends TestCase
{
    public function test_unconfigured_assumptions_are_incomplete(): void
    {
        $decision = $this->engine()->decide(
            'evaluated',
            [],
            $this->metrics(discount: '4', npvRatio: '0.90', initial: '15'),
            $this->assumptions(configured: false),
            $this->policy(),
            $this->source(),
            [],
        );

        $this->assertSame('incomplete', $decision->decision);
        $this->assertContains('financial_assumptions_missing', $decision->reasons);
    }

    public function test_four_percent_discount_is_approved(): void
    {
        $decision = $this->evaluated('4', '0.90', '15');
        $this->assertSame('approved', $decision->decision);
    }

    public function test_six_percent_discount_requires_manager(): void
    {
        $decision = $this->evaluated('6', '0.90', '15');
        $this->assertSame('manager_approval_required', $decision->decision);
        $this->assertContains('discount_exceeds_standard_policy', $decision->reasons);
    }

    public function test_nine_percent_discount_is_rejected(): void
    {
        $decision = $this->evaluated('9', '0.90', '15');
        $this->assertSame('rejected', $decision->decision);
        $this->assertContains('discount_exceeds_maximum', $decision->reasons);
    }

    public function test_confidence_is_not_used_for_decision(): void
    {
        $low = $this->engine()->decide(
            'evaluated',
            [],
            $this->metrics('4', '0.90', '15'),
            $this->assumptions(true),
            $this->policy(),
            new FinancialInputSource('property_installment_plans', 1, 'current', 'low', 'property.installment_plans', []),
            [],
        );
        $high = $this->engine()->decide(
            'evaluated',
            [],
            $this->metrics('4', '0.90', '15'),
            $this->assumptions(true),
            $this->policy(),
            new FinancialInputSource('property_installment_plans', 1, 'current', 'high', 'property.installment_plans', []),
            [],
        );

        $this->assertSame($low->decision, $high->decision);
        $this->assertSame('approved', $low->decision);
    }

    public function test_core_files_do_not_contain_real_estate_names(): void
    {
        $files = glob(dirname(__DIR__, 3).'/app/Services/FinancialDecision/{*.php,Dto/*.php}', GLOB_BRACE) ?: [];
        foreach ($files as $file) {
            if (str_contains($file, DIRECTORY_SEPARATOR.'Adapters'.DIRECTORY_SEPARATOR)) {
                continue;
            }
            $contents = strtolower((string) file_get_contents($file));
            $this->assertStringNotContainsString('handover', $contents, $file);
            $this->assertStringNotContainsString('apartment', $contents, $file);
        }
    }

    private function evaluated(string $discount, string $npvRatio, string $initial)
    {
        return $this->engine()->decide(
            'evaluated',
            [],
            $this->metrics($discount, $npvRatio, $initial),
            $this->assumptions(true),
            $this->policy(),
            $this->source(),
            [],
        );
    }

    private function engine(): DecisionEngine
    {
        return new DecisionEngine();
    }

    private function metrics(string $discount, string $npvRatio, string $initial): FinancialMetrics
    {
        return new FinancialMetrics(
            grossAmount: '1000000.00',
            discountAmount: '0.00',
            discountPercentage: $discount,
            netAmount: '1000000.00',
            npv: '900000.00',
            npvRatio: $npvRatio,
            npvPercentage: '90.0000',
            totalCashFlow: '1000000.00',
            initialCollectionPercentage: $initial,
            durationMonths: 36,
        );
    }

    private function assumptions(bool $configured): FinancialAssumptions
    {
        return new FinancialAssumptions(
            discountRate: $configured ? '0.12' : null,
            valuationDate: '2026-01-01',
            isExplicitlyConfigured: $configured,
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

    private function source(): FinancialInputSource
    {
        return new FinancialInputSource('user_utterance', null, 'current', 'high', 'message', []);
    }
}
