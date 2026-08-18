<?php

namespace App\Services\FinancialDecision;

use App\Http\Resources\FinancialEvaluationResource;
use App\Models\FinancialEvaluation;
use App\Models\User;
use App\Services\FinancialDecision\Adapters\RealEstateAdapter;
use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;
use Illuminate\Support\Facades\Schema;

final class FinancialDecisionService
{
    public function __construct(
        private readonly FinancialRequestParser $parser,
        private readonly FinancialConfigurationStore $config,
        private readonly RealEstateAdapter $adapter,
        private readonly CashFlowGenerator $generator,
        private readonly NpvCalculator $npv,
        private readonly MetricsCalculator $metrics,
        private readonly DecisionEngine $decisions,
    ) {
    }

    public function evaluate(User $user, StructuredFinancialRequest $request, string $locale = 'en'): array
    {
        $tenantId = (int) $user->tenant_id;
        $valuationDate = now()->toDateString();
        $assumptions = $this->config->assumptions($tenantId, $valuationDate);
        $policy = $this->config->policy($tenantId);
        $emptySource = new FinancialInputSource('none', null, 'current', 'low', 'none', []);

        if ($request->mode !== 'evaluate') {
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

        $resolved = $this->adapter->resolve($user, $request, $valuationDate);
        $source = $resolved['source'];
        if (! $resolved['ok'] || ! $resolved['offer']) {
            $decision = $this->decisions->decide(
                (string) ($resolved['status'] ?? 'incomplete'),
                $resolved['reasons'] ?: ['incomplete_input'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $source,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, [], $locale, $resolved['evaluable'] ?? null);
        }

        $generated = $this->generator->generate(
            $resolved['offer']->netAmount,
            $resolved['offer']->startDate,
            $resolved['allocations']
        );
        if (! $generated['ok']) {
            $decision = $this->decisions->decide(
                (string) $generated['status'],
                [$generated['reason']],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $source,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, [], $locale, $resolved['evaluable'] ?? null);
        }

        if (! $assumptions->isExplicitlyConfigured || $assumptions->discountRate === null) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['financial_assumptions_missing'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $source,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, array_map(fn ($flow) => $flow->toArray(), $generated['cash_flows']), $locale, $resolved['evaluable'] ?? null);
        }

        if (! $policy->isExplicitlyConfigured || $policy->minimumNpvRatio === null) {
            $decision = $this->decisions->decide(
                'incomplete',
                ['financial_policy_missing'],
                FinancialMetrics::empty(),
                $assumptions,
                $policy,
                $source,
                []
            );

            return $this->persistAndPresent($user, $request, $decision, array_map(fn ($flow) => $flow->toArray(), $generated['cash_flows']), $locale, $resolved['evaluable'] ?? null);
        }

        $npv = $this->npv->calculate($generated['cash_flows'], $assumptions);
        try {
            $metrics = $this->metrics->calculate($resolved['offer'], $generated['cash_flows'], $npv->npv, $assumptions->valuationDate);
        } catch (\Throwable) {
            $decision = $this->decisions->decide('invalid', ['invalid_input'], FinancialMetrics::empty(), $assumptions, $policy, $source, $npv->trace);

            return $this->persistAndPresent($user, $request, $decision, array_map(fn ($flow) => $flow->toArray(), $generated['cash_flows']), $locale, $resolved['evaluable'] ?? null);
        }

        $decision = $this->decisions->decide('evaluated', [], $metrics, $assumptions, $policy, $source, $npv->trace);

        return $this->persistAndPresent(
            $user,
            $request,
            $decision,
            array_map(fn ($flow) => $flow->toArray(), $generated['cash_flows']),
            $locale,
            $resolved['evaluable'] ?? null
        );
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

        $message = $this->composeMessage($decision, $locale);
        $public = (new FinancialEvaluationResource($decision, $cashFlows, $request->toArray(), $evaluationId, $locale, $message))->toPublicArray();

        return $public;
    }

    private function composeMessage(FinancialDecision $decision, string $locale): string
    {
        $metrics = $decision->metrics->toArray();
        $rate = $decision->assumptionsSnapshot['discount_rate'] ?? null;
        $ar = $locale === 'ar';

        $decisionLabel = match ($decision->decision) {
            'approved' => $ar ? 'مقبول' : 'Approved',
            'approved_with_warning' => $ar ? 'مقبول مع تحذير' : 'Approved with warning',
            'manager_approval_required' => $ar ? 'يحتاج موافقة مدير' : 'Manager approval required',
            'rejected' => $ar ? 'مرفوض' : 'Rejected',
            'invalid' => $ar ? 'بيانات غير صالحة' : 'Invalid input',
            default => $ar ? 'ناقص بيانات' : 'Incomplete',
        };

        $reasonText = implode(', ', $decision->reasons);
        $lines = [];
        $lines[] = $ar ? "القرار: {$decisionLabel}" : "Decision: {$decisionLabel}";
        if ($reasonText !== '') {
            $lines[] = $ar ? "السبب: {$reasonText}" : "Reasons: {$reasonText}";
        }
        $lines[] = ($ar ? 'صافي العرض: ' : 'Net offer: ').($metrics['net_amount'] ?? '0');
        $lines[] = ($ar ? 'الخصم: ' : 'Discount: ').($metrics['discount_percentage'] ?? '0').'%';
        $lines[] = 'NPV: '.($metrics['npv'] ?? '0');
        $lines[] = ($ar ? 'نسبة NPV إلى صافي العرض: ' : 'NPV ratio (NPV / net offer): ').($metrics['npv_ratio'] ?? '0');
        $lines[] = ($ar ? 'التحصيل الأولي: ' : 'Initial collection: ').($metrics['initial_collection_percentage'] ?? '0').'%';
        if ($rate !== null && $rate !== '') {
            $lines[] = ($ar ? 'معدل الخصم المستخدم: ' : 'Discount rate used: ').$rate;
        }

        return implode("\n", $lines);
    }
}
