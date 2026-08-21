<?php

namespace Tests\Unit\FinancialDecision;

use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\FinancialNarrationService;
use App\Services\FinancialDecision\FinancialReplyFormatter;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FinancialNarrationServiceTest extends TestCase
{
    public function test_falls_back_when_gemini_key_missing(): void
    {
        config(['services.gemini.api_key' => '']);

        $service = new FinancialNarrationService(new FinancialReplyFormatter());
        $decision = $this->sampleDecision();
        $facts = (new FinancialReplyFormatter())->composeMessage($decision, 'ar', 'evaluate');

        $this->assertSame($facts, $service->narrate($decision, 'ar', 'evaluate', $facts));
    }

    public function test_accepts_gemini_reply_that_keeps_engine_numbers(): void
    {
        config([
            'services.gemini.api_key' => 'test-key',
            'services.gemini.model' => 'gemini-test',
        ]);

        $decision = $this->sampleDecision();
        $formatter = new FinancialReplyFormatter();
        $facts = $formatter->composeMessage($decision, 'ar', 'evaluate');

        $geminiText = 'العرض مرفوض لأن الخصم أعلى من الحد الأقصى المسموح. '
            .'صافي العرض 910,000.00 ج.م بعد خصم 9%، والقيمة الحالية 873,489.50 ج.م. '
            .'عشان يعدي، أقصى خصم مقبول: 5%.';

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [['text' => $geminiText]],
                    ],
                ]],
            ], 200),
        ]);

        $service = new FinancialNarrationService($formatter);
        $out = $service->narrate($decision, 'ar', 'evaluate', $facts);

        $this->assertSame($geminiText, $out);
    }

    public function test_rejects_gemini_reply_that_drops_decision_or_numbers(): void
    {
        config([
            'services.gemini.api_key' => 'test-key',
            'services.gemini.model' => 'gemini-test',
        ]);

        $decision = $this->sampleDecision();
        $formatter = new FinancialReplyFormatter();
        $facts = $formatter->composeMessage($decision, 'ar', 'evaluate');

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [['text' => 'ممكن نوافق على العرض ده بسهولة بدون ما نذكر أي أرقام من المحرك.']],
                    ],
                ]],
            ], 200),
        ]);

        $service = new FinancialNarrationService($formatter);
        $out = $service->narrate($decision, 'ar', 'evaluate', $facts);

        $this->assertSame($facts, $out);
    }

    private function sampleDecision(): FinancialDecision
    {
        return new FinancialDecision(
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
    }
}
