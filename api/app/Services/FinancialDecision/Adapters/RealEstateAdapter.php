<?php

namespace App\Services\FinancialDecision\Adapters;

use App\Models\Lead;
use App\Models\Project;
use App\Models\Property;
use App\Models\User;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialOffer;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;
use App\Services\FinancialDecision\Money;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\Schema;

final class RealEstateAdapter
{
    use UserHierarchyTrait;

    /**
     * @return array{
     *   ok:bool,
     *   status:?string,
     *   reasons:list<string>,
     *   offer:?FinancialOffer,
     *   allocations:list<array<string,mixed>>,
     *   source:FinancialInputSource,
     *   evaluable:?array{type:string,id:int}
     * }
     */
    public function resolve(User $user, StructuredFinancialRequest $request, string $startDate): array
    {
        $candidates = [];
        $lead = $request->leadId ? $this->findVisibleLead($user, $request->leadId) : null;
        if ($request->leadId && ! $lead) {
            return $this->fail('invalid', ['lead_not_visible'], $this->source('none', null, 'low', 'lead_id', []));
        }

        $property = $this->resolveProperty($user, $request, $lead);
        $project = $property?->project_id && Schema::hasTable('projects')
            ? Project::query()->find($property->project_id)
            : ($lead?->project_id && Schema::hasTable('projects') ? Project::query()->find($lead->project_id) : null);

        $leadPlan = is_array($lead?->meta_data['payment_plan'] ?? null) ? $lead->meta_data['payment_plan'] : [];
        $propertyPlans = is_array($property?->installment_plans) ? $property->installment_plans : [];
        $projectPlans = is_array($project?->payment_plan) ? $project->payment_plan : [];

        if ($leadPlan !== []) {
            $candidates[] = 'lead_payment_plan';
        }
        if ($propertyPlans !== []) {
            $candidates[] = 'property_installment_plans';
        }
        if ($projectPlans !== []) {
            $candidates[] = 'project_payment_plan';
        }

        $propertyPlan = $propertyPlans[0] ?? [];
        $projectPlan = $projectPlans[0] ?? [];
        $useLeadPlan = $leadPlan !== [] && $this->leadPlanMatchesProperty($leadPlan, $property);

        $schedulePlan = $useLeadPlan ? $leadPlan : ($propertyPlan !== [] ? $propertyPlan : $projectPlan);
        $sourceType = $useLeadPlan
            ? 'lead_payment_plan'
            : ($propertyPlan !== [] ? 'property_installment_plans' : ($projectPlan !== [] ? 'project_payment_plan' : 'user_utterance'));
        $resolvedFrom = $useLeadPlan
            ? 'lead.meta_data.payment_plan'
            : ($propertyPlan !== [] ? 'property.installment_plans' : ($projectPlan !== [] ? 'project.payment_plan' : 'structured_request'));

        $gross = $this->firstNumber([
            $request->grossAmount,
            $useLeadPlan ? ($leadPlan['totalAmount'] ?? $leadPlan['total_amount'] ?? null) : null,
            $property?->price,
            $property?->total_price ?? null,
        ]);

        if ($gross === null) {
            return $this->fail('incomplete', ['gross_amount_missing'], $this->source($sourceType, $property?->id ?? $lead?->id, 'low', $resolvedFrom, $candidates));
        }

        [$discountAmount, $discountPercentage] = $this->resolveDiscount($request, $property, $gross);
        if (Money::cmp($discountAmount, '0') < 0 || Money::cmp($discountPercentage, '0') < 0) {
            return $this->fail('invalid', ['invalid_input'], $this->source($sourceType, $property?->id ?? $lead?->id, 'low', $resolvedFrom, $candidates));
        }

        $netBase = $useLeadPlan
            ? ($this->number($leadPlan['netAmount'] ?? $leadPlan['net_amount'] ?? null) ?? Money::add(
                Money::sub($gross, $discountAmount),
                Money::add(
                    $this->number($leadPlan['garageAmount'] ?? $leadPlan['garage_amount'] ?? 0) ?? '0',
                    $this->number($leadPlan['maintenanceAmount'] ?? $leadPlan['maintenance_amount'] ?? 0) ?? '0'
                )
            ))
            : ($this->number($property?->total_after_discount) ?? Money::sub($gross, $discountAmount));

        $offer = new FinancialOffer(
            grossAmount: $gross,
            discountAmount: $discountAmount,
            discountPercentage: $discountPercentage,
            netAmount: $netBase,
            currency: (string) ($property?->currency ?: 'EGP'),
            startDate: $startDate,
            metadata: [
                'property_id' => $property?->id,
                'lead_id' => $lead?->id,
            ],
        );

        $allocations = $this->allocations($request, $schedulePlan, $useLeadPlan, $offer->netAmount);
        if ($allocations === []) {
            return $this->fail(
                'incomplete',
                ['payment_schedule_missing'],
                $this->source($sourceType, $property?->id ?? $lead?->id, 'low', $resolvedFrom, $candidates),
                $offer
            );
        }

        $confidence = $useLeadPlan || $propertyPlan !== [] ? 'high' : ($projectPlan !== [] ? 'medium' : 'low');
        $source = $this->source(
            $sourceType,
            $useLeadPlan ? $lead?->id : ($property?->id ?? $project?->id),
            $confidence,
            $resolvedFrom,
            $candidates
        );

        $evaluable = $lead
            ? ['type' => Lead::class, 'id' => (int) $lead->id]
            : ($property ? ['type' => Property::class, 'id' => (int) $property->id] : null);

        return [
            'ok' => true,
            'status' => null,
            'reasons' => [],
            'offer' => $offer,
            'allocations' => $allocations,
            'source' => $source,
            'evaluable' => $evaluable,
        ];
    }

    private function resolveDiscount(StructuredFinancialRequest $request, ?Property $property, string $gross): array
    {
        if ($request->discountAmount !== null) {
            $amount = Money::of($request->discountAmount);
            $percentage = Money::cmp($gross, '0') > 0 ? Money::div(Money::mul($amount, '100'), $gross) : '0';

            return [$amount, $percentage];
        }

        if ($request->discountPercentage !== null) {
            $percentage = Money::of($request->discountPercentage);
            $amount = Money::div(Money::mul($gross, $percentage), '100');

            return [$amount, $percentage];
        }

        $raw = $this->number($property?->discount ?? 0) ?? '0';
        $type = strtolower((string) ($property?->discount_type ?? 'amount'));
        if (in_array($type, ['percentage', 'percent'], true)) {
            return [Money::div(Money::mul($gross, $raw), '100'), $raw];
        }

        $percentage = Money::cmp($gross, '0') > 0 ? Money::div(Money::mul($raw, '100'), $gross) : '0';

        return [$raw, $percentage];
    }

    /**
     * @param  array<string,mixed>  $plan
     * @return list<array<string,mixed>>
     */
    private function allocations(StructuredFinancialRequest $request, array $plan, bool $leadPlan, string $net): array
    {
        $downPercentage = $request->downPaymentPercentage;
        $downAmount = $request->downPaymentAmount;
        if ($downPercentage === null && $downAmount === null) {
            [$downAmount, $downPercentage] = $this->planDownPayment($plan, $net, $leadPlan);
        }

        $months = $request->durationMonths;
        if ($months === null && $request->durationYears !== null) {
            $months = $request->durationYears * 12;
        }
        $frequency = $this->mapFrequency($request->frequency ?? ($plan['installmentFrequency'] ?? $plan['installment_frequency'] ?? $plan['installment_type'] ?? 'monthly'));
        if ($months === null) {
            $months = $this->planMonths($plan, $leadPlan, $frequency);
        }

        $receipt = $this->planReceipt($plan, $net, $leadPlan);

        $allocations = [];
        if ($downPercentage !== null) {
            $allocations[] = ['type' => 'initial_payment', 'percentage' => $downPercentage, 'count' => 1];
        } elseif ($downAmount !== null) {
            $allocations[] = ['type' => 'initial_payment', 'amount' => $downAmount, 'count' => 1];
        }

        if ($receipt !== null && Money::cmp($receipt, '0') > 0) {
            $allocations[] = ['type' => 'milestone', 'amount' => $receipt, 'count' => 1];
        }

        $used = '0';
        foreach ($allocations as $row) {
            if (isset($row['percentage'])) {
                $used = Money::add($used, Money::div(Money::mul($net, Money::of($row['percentage'])), '100'));
            } else {
                $used = Money::add($used, Money::of($row['amount']));
            }
        }
        $remaining = Money::sub($net, $used);
        if ($months !== null && $months > 0 && Money::cmp($remaining, '0') > 0) {
            $allocations[] = [
                'type' => 'installment',
                'amount' => $remaining,
                'count' => $months,
                'frequency' => $frequency,
            ];
        }

        return $allocations;
    }

    /**
     * @param  array<string,mixed>  $plan
     */
    private function planDownPayment(array $plan, string $net, bool $leadPlan): array
    {
        $raw = $this->number($plan['downPayment'] ?? $plan['down_payment'] ?? $plan['dp'] ?? $plan['downPct'] ?? null);
        if ($raw === null) {
            return [null, null];
        }

        if ($leadPlan) {
            $percentage = Money::cmp($net, '0') > 0 ? Money::div(Money::mul($raw, '100'), $net) : '0';

            return [$raw, $percentage];
        }

        $type = strtolower((string) ($plan['downPaymentType'] ?? $plan['down_payment_type'] ?? 'percentage'));
        if (in_array($type, ['amount', 'value'], true)) {
            $percentage = Money::cmp($net, '0') > 0 ? Money::div(Money::mul($raw, '100'), $net) : '0';

            return [$raw, $percentage];
        }

        return [Money::div(Money::mul($net, $raw), '100'), $raw];
    }

    /**
     * @param  array<string,mixed>  $plan
     */
    private function planReceipt(array $plan, string $net, bool $leadPlan): ?string
    {
        $raw = $this->number($plan['receiptAmount'] ?? $plan['receipt_amount'] ?? $plan['delivery_payment'] ?? null);
        if ($raw === null) {
            return null;
        }

        if ($leadPlan) {
            return $raw;
        }

        $type = strtolower((string) ($plan['receiptAmountType'] ?? $plan['receipt_amount_type'] ?? 'amount'));
        if (in_array($type, ['percentage', 'percent'], true)) {
            return Money::div(Money::mul($net, $raw), '100');
        }

        return $raw;
    }

    /**
     * @param  array<string,mixed>  $plan
     */
    private function planMonths(array $plan, bool $leadPlan, string $frequency): ?int
    {
        if ($leadPlan) {
            $months = (int) ($plan['noOfMonths'] ?? $plan['no_of_months'] ?? $plan['months'] ?? 0);

            return $months > 0 ? $months : null;
        }

        $years = (float) ($plan['years'] ?? $plan['duration'] ?? 0);
        $perYear = match ($frequency) {
            'monthly' => 12,
            'quarterly' => 4,
            'semiannual' => 2,
            'annual' => 1,
            default => 12,
        };
        if ($years > 0) {
            return (int) round($years * $perYear);
        }

        $count = (int) ($plan['installmentCount'] ?? $plan['installment_count'] ?? 0);

        return $count > 0 ? $count : null;
    }

    private function mapFrequency(?string $value): string
    {
        $raw = strtolower(trim((string) $value));

        return match ($raw) {
            'quarterly' => 'quarterly',
            'semi-annual', 'semiannual', 'half-yearly' => 'semiannual',
            'annual', 'yearly' => 'annual',
            default => 'monthly',
        };
    }

    /**
     * @param  array<string,mixed>  $leadPlan
     */
    private function leadPlanMatchesProperty(array $leadPlan, ?Property $property): bool
    {
        if (! $property) {
            return true;
        }

        $unitNo = strtolower(trim((string) ($leadPlan['unitNo'] ?? $leadPlan['unit_no'] ?? '')));
        if ($unitNo === '') {
            return true;
        }

        $candidates = [
            $property->unit_number ?? null,
            $property->unit_code ?? null,
            $property->name ?? null,
            $property->title ?? null,
        ];
        foreach ($candidates as $candidate) {
            if ($candidate !== null && strtolower(trim((string) $candidate)) === $unitNo) {
                return true;
            }
        }

        return false;
    }

    private function resolveProperty(User $user, StructuredFinancialRequest $request, ?Lead $lead): ?Property
    {
        if (! Schema::hasTable('properties')) {
            return null;
        }

        if ($request->unitId) {
            return Property::query()
                ->where('id', $request->unitId)
                ->where('tenant_id', $user->tenant_id)
                ->first();
        }

        $itemId = $lead?->item_id;
        if ($itemId) {
            return Property::query()
                ->where('id', $itemId)
                ->where('tenant_id', $user->tenant_id)
                ->first();
        }

        return null;
    }

    private function findVisibleLead(User $user, int $leadId): ?Lead
    {
        if ($leadId <= 0 || ! Schema::hasTable('leads')) {
            return null;
        }

        $query = Lead::query()->where('id', $leadId)->where('tenant_id', $user->tenant_id);
        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id)
                    ->orWhere('assigned_to', $user->id);
            });
        }

        return $query->first();
    }

    /**
     * @param  list<mixed>  $values
     */
    private function firstNumber(array $values): ?string
    {
        foreach ($values as $value) {
            $number = $this->number($value);
            if ($number !== null && Money::cmp($number, '0') > 0) {
                return $number;
            }
        }

        return null;
    }

    private function number(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = str_replace(',', '', trim((string) $value));
        if (! is_numeric($raw)) {
            return null;
        }

        return Money::of($raw);
    }

    /**
     * @param  list<string>  $reasons
     * @param  list<string>  $candidates
     */
    private function fail(string $status, array $reasons, FinancialInputSource $source, ?FinancialOffer $offer = null): array
    {
        return [
            'ok' => false,
            'status' => $status,
            'reasons' => $reasons,
            'offer' => $offer,
            'allocations' => [],
            'source' => $source,
            'evaluable' => null,
        ];
    }

    /**
     * @param  list<string>  $candidates
     */
    private function source(string $type, ?int $id, string $confidence, string $resolvedFrom, array $candidates): FinancialInputSource
    {
        return new FinancialInputSource($type, $id, 'current', $confidence, $resolvedFrom, $candidates);
    }
}
