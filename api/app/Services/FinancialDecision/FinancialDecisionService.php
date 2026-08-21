<?php

namespace App\Services\FinancialDecision;

use App\Http\Resources\FinancialEvaluationResource;
use App\Models\FinancialEvaluation;
use App\Models\User;
use App\Services\FinancialDecision\Adapters\FinancialInputAdapter;
use App\Services\FinancialDecision\Adapters\RealEstateAdapter;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\FinancialPolicy;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;
use Illuminate\Support\Facades\Schema;

final class FinancialDecisionService
{
    private const SUPPORTED_MODES = ['evaluate', 'max_discount'];

    public function __construct(
        private readonly FinancialRequestParser $parser,
        private readonly FinancialConfigurationStore $config,
        private readonly FinancialInputAdapter $adapter,
        private readonly CashFlowGenerator $generator,
        private readonly NpvCalculator $npv,
        private readonly MetricsCalculator $metrics,
        private readonly DecisionEngine $decisions,
        private readonly ReverseCalcEngine $reverse,
        private readonly FinancialReplyFormatter $replies,
        private readonly FinancialNarrationService $narration,
    ) {
    }

    public function evaluate(User $user, StructuredFinancialRequest $request, string $locale = 'en'): array
    {
        $tenantId = (int) $user->tenant_id;
        $valuationDate = now()->toDateString();
        $assumptions = $this->config->assumptions($tenantId, $valuationDate);
        $policy = $this->config->policy($tenantId);
        $emptySource = new FinancialInputSource('none', null, 'current', 'low', 'none', []);

        if (! in_array($request->mode, self::SUPPORTED_MODES, true)) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['not_implemented'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $emptySource,
                [],
                $request->mode
            );

            return $this->persistAndPresent($user, $request, $decision, [], $locale);
        }

        $invalid = $this->validateRequest($request);
        if ($invalid !== []) {
            $decision = $this->decisions->decide('invalid', $invalid, FinancialMetrics::empty(), $assumptions, $policy, $emptySource, []);

            return $this->persistAndPresent($user, $request, $decision, [], $locale);
        }

        if ($request->mode === 'max_discount') {
            return $this->presentMaxDiscount($user, $request, $assumptions, $policy, $valuationDate, $locale);
        }

        $run = $this->runEvaluate($user, $request, $assumptions, $policy, $valuationDate, true);

        return $this->persistAndPresent(
            $user,
            $request,
            $run['decision'],
            $run['cash_flows'],
            $locale,
            $run['evaluable']
        );
    }

    private function presentMaxDiscount(
        User $user,
        StructuredFinancialRequest $request,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
        string $locale,
    ): array {
        $emptySource = new FinancialInputSource('none', null, 'current', 'low', 'none', []);

        if (! $assumptions->isExplicitlyConfigured || $assumptions->discountRate === null) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['financial_assumptions_missing'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $emptySource,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, [], $locale);
        }

        if (! $policy->isExplicitlyConfigured || $policy->minimumNpvRatio === null) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['financial_policy_missing'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $emptySource,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, [], $locale);
        }

        $recommendations = $this->reverse->recommend($user, $request, $assumptions, $policy, $valuationDate);
        $maxApproved = $this->recommendationValue($recommendations, 'max_discount_percentage');

        if ($maxApproved === null) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['reverse_calc_unavailable'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $emptySource,
                []
            );

            return $this->persistAndPresent($user, $request, $decision->withRecommendations($recommendations), [], $locale);
        }

        $scenarioRequest = $this->parser->fromArray(array_merge($request->toArray(), [
            'discount_percentage' => $maxApproved,
            'discount_amount' => null,
            'mode' => 'evaluate',
            'intent' => 'evaluate',
        ]));

        $run = $this->runEvaluate($user, $scenarioRequest, $assumptions, $policy, $valuationDate, false);
        $decision = $run['decision']->withRecommendations($recommendations);

        return $this->persistAndPresent($user, $request, $decision, $run['cash_flows'], $locale, $run['evaluable']);
    }

    /**
     * @return array{decision:FinancialDecision,cash_flows:list<array<string,mixed>>,evaluable:?array{type:string,id:int}}
     */
    private function runEvaluate(
        User $user,
        StructuredFinancialRequest $request,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
        bool $attachReverseOnReject,
    ): array {
        $emptySource = new FinancialInputSource('none', null, 'current', 'low', 'none', []);

        $resolved = $this->adapter->resolve($user, $request, $valuationDate);
        $source = $resolved['source'];
        if (! $resolved['ok'] || ! $resolved['offer']) {
            return [
                'decision' => $this->decisions->decide(
                    (string) ($resolved['status'] ?? 'incomplete'),
                    $resolved['reasons'] ?: ['incomplete_input'],
                    FinancialMetrics::empty(),
                    $assumptions,
                    $policy,
                    $source,
                    []
                ),
                'cash_flows' => [],
                'evaluable' => $resolved['evaluable'] ?? null,
            ];
        }

        $generated = $this->generator->generate(
            $resolved['offer']->netAmount,
            $resolved['offer']->startDate,
            $resolved['allocations']
        );
        if (! $generated['ok']) {
            return [
                'decision' => $this->decisions->decide(
                    (string) $generated['status'],
                    [$generated['reason']],
                    FinancialMetrics::empty(),
                    $assumptions,
                    $policy,
                    $source,
                    []
                ),
                'cash_flows' => [],
                'evaluable' => $resolved['evaluable'] ?? null,
            ];
        }

        $cashFlows = array_map(fn ($flow) => $flow->toArray(), $generated['cash_flows']);

        if (! $assumptions->isExplicitlyConfigured || $assumptions->discountRate === null) {
            return [
                'decision' => $this->decisions->decide(
                    'incomplete',
                    ['financial_assumptions_missing'],
                    FinancialMetrics::empty(),
                    $assumptions,
                    $policy,
                    $source,
                    []
                ),
                'cash_flows' => $cashFlows,
                'evaluable' => $resolved['evaluable'] ?? null,
            ];
        }

        if (! $policy->isExplicitlyConfigured || $policy->minimumNpvRatio === null) {
            return [
                'decision' => $this->decisions->decide(
                    'incomplete',
                    ['financial_policy_missing'],
                    FinancialMetrics::empty(),
                    $assumptions,
                    $policy,
                    $source,
                    []
                ),
                'cash_flows' => $cashFlows,
                'evaluable' => $resolved['evaluable'] ?? null,
            ];
        }

        $npv = $this->npv->calculate($generated['cash_flows'], $assumptions);
        try {
            $metrics = $this->metrics->calculate($resolved['offer'], $generated['cash_flows'], $npv->npv, $assumptions->valuationDate);
        } catch (\Throwable) {
            return [
                'decision' => $this->decisions->decide('invalid', ['invalid_input'], FinancialMetrics::empty(), $assumptions, $policy, $source, $npv->trace),
                'cash_flows' => $cashFlows,
                'evaluable' => $resolved['evaluable'] ?? null,
            ];
        }

        $decision = $this->decisions->decide('evaluated', [], $metrics, $assumptions, $policy, $source, $npv->trace);

        if ($attachReverseOnReject && in_array($decision->decision, ['rejected', 'manager_approval_required'], true)) {
            $recs = $this->reverse->recommend($user, $request, $assumptions, $policy, $valuationDate);
            if ($recs !== []) {
                $decision = $decision->withRecommendations($recs);
            }
        }

        return [
            'decision' => $decision,
            'cash_flows' => $cashFlows,
            'evaluable' => $resolved['evaluable'] ?? null,
        ];
    }

    /**
     * @return list<string>
     */
    private function validateRequest(StructuredFinancialRequest $request): array
    {
        foreach ([
            $request->discountPercentage,
            $request->discountAmount,
            $request->downPaymentPercentage,
            $request->downPaymentAmount,
            $request->grossAmount,
        ] as $value) {
            if ($value !== null && Money::cmp(Money::of($value), '0') < 0) {
                return ['invalid_input'];
            }
        }

        if ($request->durationMonths !== null && $request->durationMonths < 0) {
            return ['invalid_input'];
        }

        return [];
    }

    /**
     * @param  list<array<string,mixed>>  $cashFlows
     * @param  array{type:string,id:int}|null  $evaluable
     */
    private function persistAndPresent(
        User $user,
        StructuredFinancialRequest $request,
        FinancialDecision $decision,
        array $cashFlows,
        string $locale,
        ?array $evaluable = null,
    ): array {
        $evaluationId = null;
        if (Schema::hasTable('financial_evaluations')) {
            $row = FinancialEvaluation::query()->create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'evaluable_type' => $evaluable['type'] ?? null,
                'evaluable_id' => $evaluable['id'] ?? null,
                'input' => $request->toArray(),
                'cash_flows' => $cashFlows,
                'metrics' => $decision->metrics->toArray(),
                'decision_payload' => [
                    'decision' => $decision->decision,
                    'reasons' => $decision->reasons,
                    'warnings' => $decision->warnings,
                    'recommendations' => $decision->recommendations,
                ],
                'assumptions_snapshot' => $decision->assumptionsSnapshot,
                'input_source' => $decision->inputSource,
                'calculation_trace' => $decision->calculationTrace,
                'policy_version_id' => $decision->policySnapshot['version_id'] ?? null,
                'engine_version' => $decision->engineVersion,
                'decision' => $decision->decision,
                'status' => $decision->status,
            ]);
            $evaluationId = $row->id;
        }

        $factsMessage = $this->replies->composeMessage($decision, $locale, $request->mode);
        $message = $this->narration->narrate($decision, $locale, $request->mode, $factsMessage);
        $card = $this->replies->cardAction($decision, $locale, $request->mode);
        $card['narrative'] = $message;

        $public = (new FinancialEvaluationResource($decision, $cashFlows, $request->toArray(), $evaluationId, $locale, $message))->toPublicArray();
        $public['ui_actions'] = [$card];

        return $public;
    }

    /**
     * @param  list<array<string,mixed>>  $recommendations
     */
    private function recommendationValue(array $recommendations, string $code): ?string
    {
        return $this->replies->recommendationValue($recommendations, $code);
    }
}
