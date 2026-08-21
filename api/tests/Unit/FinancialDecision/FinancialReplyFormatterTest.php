<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\FinancialReplyFormatter;
use PHPUnit\Framework\TestCase;

class FinancialReplyFormatterTest extends TestCase
{
    public function test_arabic_reply_translates_reason_codes_and_formats_numbers(): void
    {
        $formatter = new FinancialReplyFormatter();
        $decision = new FinancialDecision(
            decision: 'rejected',
            status: 'evaluated',
            reasons: ['discount_exceeds_maximum'],
            warnings: [],
            metrics: new FinancialMetrics(
                grossAmount: '1000000.00',
                discountAmount: '90000.00',
                discountPercentage: '9.0000',
                netAmount: '910000.00',
                npv: '873489.50',
                npvRatio: '0.959879',
                npvPercentage: '95.9879',
                totalCashFlow: '910000.00',
                initialCollectionPercentage: '20.0000',
                durationMonths: 12,
            ),
            assumptionsSnapshot: ['discount_rate' => '0.1200'],
            policySnapshot: [],
            inputSource: [],
            calculationTrace: [],
            engineVersion: '1.1.0',
            recommendations: [[
                'code' => 'max_discount_percentage',
                'value' => '5.00',
                'unit' => 'percent',
                'target_decision' => 'approved',
            ]],
        );

        $message = $formatter->composeMessage($decision, 'ar', 'evaluate');
        $card = $formatter->cardAction($decision, 'ar', 'evaluate');

        $this->assertStringContainsString('مرفوض', $message);
        $this->assertStringContainsString('الخصم أعلى من الحد الأقصى المسموح', $message);
        $this->assertStringContainsString('مقدم 20%', $message);
        $this->assertStringContainsString('910,000.00 ج.م', $message);
        $this->assertStringContainsString('أقصى خصم مقبول: 5%', $message);
        $this->assertStringNotContainsString('discount_exceeds_maximum', $message);
        $this->assertSame('financial_decision_card', $card['type']);
        $this->assertSame('ar', $card['locale']);
        $this->assertSame('danger', $card['tone']);
        $this->assertSame('مرفوض', $card['decision_label']);
        $this->assertSame('القرار', $card['labels']['decision']);
    }
}
