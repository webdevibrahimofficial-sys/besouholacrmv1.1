<?php

namespace Tests\Unit\FinancialDecision;

use App\Http\Resources\FinancialEvaluationResource;
use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\FinancialRequestParser;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

class FinancialRequestParserTest extends TestCase
{
    public function test_malformed_json_falls_back_to_php_parser(): void
    {
        $parser = new FinancialRequestParser();
        $message = 'Evaluate offer for lead 42 with 6.5% discount and 10% down payment over 7 years';
        $parsed = $parser->parseLlmOutputOrFallback('this is not json at all', $message);

        $this->assertSame('php', $parsed->parserSource);
        $this->assertSame(42, $parsed->leadId);
        $this->assertSame('6.5', $parsed->discountPercentage);
        $this->assertSame('10', $parsed->downPaymentPercentage);
        $this->assertSame(7, $parsed->durationYears);
    }

    public function test_empty_llm_text_falls_back_to_php_parser(): void
    {
        $parser = new FinancialRequestParser();
        $parsed = $parser->parseLlmOutputOrFallback('', 'خصم 4% مقدم 20% lead 9');

        $this->assertSame('php', $parsed->parserSource);
        $this->assertSame(9, $parsed->leadId);
        $this->assertSame('4', $parsed->discountPercentage);
        $this->assertSame('20', $parsed->downPaymentPercentage);
    }

    public function test_json_inside_markdown_fence_is_parsed(): void
    {
        $parser = new FinancialRequestParser();
        $raw = <<<TEXT
```json
{"intent":"evaluate","lead_id":123,"discount_percentage":6.5,"discount_amount":null,"down_payment_percentage":10,"down_payment_amount":null,"duration_months":84,"duration_years":null,"gross_amount":null,"frequency":null}
```
TEXT;
        $parsed = $parser->parseLlmOutputOrFallback($raw, 'ignored message');

        $this->assertSame('llm', $parsed->parserSource);
        $this->assertSame(123, $parsed->leadId);
        $this->assertSame('6.5', $parsed->discountPercentage);
        $this->assertSame(84, $parsed->durationMonths);
    }

    public function test_forbidden_fields_are_stripped_before_validation(): void
    {
        $parser = new FinancialRequestParser();
        $parsed = $parser->fromArray([
            'intent' => 'evaluate',
            'lead_id' => 11,
            'discount_percentage' => 4,
            'decision' => 'approved',
            'npv' => 999,
            'npv_ratio' => 1.2,
            'approved' => true,
            'monthly_payment' => 5000,
            'recommendation' => 'take it',
            'confidence' => 'high',
            'computed' => ['npv' => 1],
            'reasons' => ['should_not_pass'],
        ]);

        $payload = $parsed->toArray();
        $this->assertSame(11, $payload['lead_id']);
        $this->assertSame('4', $payload['discount_percentage']);
        $this->assertContains('decision', $parsed->strippedFields);
        $this->assertContains('npv', $parsed->strippedFields);
        $this->assertContains('confidence', $parsed->strippedFields);
        $this->assertArrayNotHasKey('decision', array_diff_key($payload, ['mode' => true]));
        $this->assertArrayNotHasKey('npv', $payload);
        $this->assertArrayNotHasKey('confidence', $payload);
        $this->assertArrayNotHasKey('approved', $payload);
    }

    public function test_json_resource_omits_calculation_trace(): void
    {
        $decision = new FinancialDecision(
            decision: 'approved',
            status: 'evaluated',
            reasons: [],
            warnings: [],
            metrics: FinancialMetrics::empty(),
            assumptionsSnapshot: ['discount_rate' => '0.10'],
            policySnapshot: ['minimum_npv_ratio' => '0.80'],
            inputSource: ['confidence' => 'low'],
            calculationTrace: [['pv' => '1', 'secret' => true]],
            engineVersion: '1.0.0',
        );

        $resource = new FinancialEvaluationResource($decision, [], [], 7, 'en', 'ok');
        $payload = $resource->toArray(Request::create('/'));
        $encoded = json_encode($payload);

        $this->assertStringNotContainsString('calculation_trace', $encoded);
        $this->assertArrayNotHasKey('calculation_trace', $payload);
        $this->assertSame('approved', $payload['decision']);
        $this->assertSame('low', $payload['input_source']['confidence']);
    }

    public function test_parser_detects_max_discount_mode_and_gross_amount(): void
    {
        $parser = new FinancialRequestParser();
        $parsed = $parser->parseWithPhp('ما هو أقصى خصم مقبول سعر الوحدة 1000000 مقدم 20% لمدة 12 شهر');

        $this->assertSame('max_discount', $parsed['mode']);
        $this->assertSame('max_discount', $parsed['intent']);
        $this->assertSame('1000000', $parsed['gross_amount']);
        $this->assertSame('20', $parsed['down_payment_percentage']);
        $this->assertSame(12, $parsed['duration_months']);
    }
}
