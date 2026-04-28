<?php

namespace App\Services;

use App\Models\CcContract;
use App\Models\CcCustomer;
use App\Models\CcCustomerUnit;
use App\Models\CcInstallment;
use App\Models\CcPayment;
use App\Models\CcPaymentAllocation;
use App\Models\CcPaymentPlanVersion;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class ContractCollectionsService
{
    public function createPaymentPlanVersion(CcCustomerUnit $customerUnit, array $payload, User $actor): CcPaymentPlanVersion
    {
        $tenantId = (int) $actor->tenant_id;
        if ((int) $customerUnit->tenant_id !== $tenantId) {
            throw ValidationException::withMessages(['customer_unit_id' => 'Invalid customer unit for tenant.']);
        }

        return DB::transaction(function () use ($customerUnit, $payload, $actor, $tenantId) {
            $latestVersion = (int) (CcPaymentPlanVersion::where('tenant_id', $tenantId)
                ->where('customer_unit_id', $customerUnit->id)
                ->max('version') ?? 0);

            CcPaymentPlanVersion::where('tenant_id', $tenantId)
                ->where('customer_unit_id', $customerUnit->id)
                ->where('is_active', true)
                ->update(['is_active' => false]);

            $next = $latestVersion + 1;
            $plan = CcPaymentPlanVersion::create([
                'tenant_id' => $tenantId,
                'customer_unit_id' => $customerUnit->id,
                'version' => $next,
                'is_active' => true,
                'reservation_amount' => (float) ($payload['reservation_amount'] ?? 0),
                'down_payment' => (float) ($payload['down_payment'] ?? 0),
                'delivery_payment' => (float) ($payload['delivery_payment'] ?? 0),
                'installment_type' => $payload['installment_type'] ?? null,
                'installment_count' => (int) ($payload['installment_count'] ?? 0),
                'installment_value' => (float) ($payload['installment_value'] ?? 0),
                'meta_data' => $payload['meta_data'] ?? null,
            ]);

            try {
                activity('contract_collections')
                    ->causedBy($actor)
                    ->performedOn($customerUnit)
                    ->withProperties([
                        'action' => 'payment_plan_version_created',
                        'customer_unit_id' => $customerUnit->id,
                        'version' => $plan->version,
                        'payload' => [
                            'reservation_amount' => $plan->reservation_amount,
                            'down_payment' => $plan->down_payment,
                            'delivery_payment' => $plan->delivery_payment,
                            'installment_type' => $plan->installment_type,
                            'installment_count' => $plan->installment_count,
                            'installment_value' => $plan->installment_value,
                        ],
                    ])
                    ->log('cc_payment_plan_version');
            } catch (\Throwable $e) {
            }

            return $plan;
        });
    }

    public function createCustomerUnit(array $payload, User $actor): CcCustomerUnit
    {
        $tenantId = (int) $actor->tenant_id;

        $customerId = (int) $payload['customer_id'];
        $propertyId = (int) $payload['property_id'];

        $customer = CcCustomer::where('tenant_id', $tenantId)->findOrFail($customerId);
        $property = Property::where('tenant_id', $tenantId)->findOrFail($propertyId);

        $existing = CcContract::where('tenant_id', $tenantId)->where('property_id', $property->id)->first();
        if ($existing) {
            throw ValidationException::withMessages(['property_id' => 'This unit already has a contract.']);
        }

        $existingReservedUnit = CcCustomerUnit::where('tenant_id', $tenantId)
            ->where('property_id', $property->id)
            ->whereIn('status', ['reserved', 'contracted'])
            ->orderByDesc('id')
            ->first();

        if ($existingReservedUnit && (int) $existingReservedUnit->customer_id !== (int) $customer->id) {
            throw ValidationException::withMessages(['property_id' => 'This unit is already reserved for another customer.']);
        }

        $curStatus = strtolower(trim((string) ($property->status ?? '')));
        if (in_array($curStatus, ['sold', 'rented'], true)) {
            throw ValidationException::withMessages(['property_id' => 'This unit is not available.']);
        }

        if ($curStatus === 'reserved' && !empty($property->reserved_expires_at) && now()->lt($property->reserved_expires_at)) {
            // Reserved via lead actions (time-boxed). CC reservations should normally clear reserved_expires_at.
            throw ValidationException::withMessages(['property_id' => 'This unit is currently reserved.']);
        }

        return DB::transaction(function () use ($payload, $actor, $tenantId, $customer, $propertyId) {
            $unit = CcCustomerUnit::firstOrCreate(
                ['tenant_id' => $tenantId, 'customer_id' => $customer->id, 'property_id' => $propertyId],
                [
                    'status' => $payload['status'] ?? 'reserved',
                    'reserved_at' => now(),
                    'meta_data' => $payload['meta_data'] ?? null,
                ]
            );

            if (!$unit->wasRecentlyCreated) {
                $unit->fill([
                    'status' => $payload['status'] ?? $unit->status,
                    'meta_data' => $payload['meta_data'] ?? $unit->meta_data,
                ]);
                if (($payload['status'] ?? null) === 'reserved' && !$unit->reserved_at) {
                    $unit->reserved_at = now();
                }
                if (($payload['status'] ?? null) === 'contracted' && !$unit->contracted_at) {
                    $unit->contracted_at = now();
                }
                $unit->save();
            }

            $this->syncPropertyOnReservation($unit, $actor);

            return $unit;
        });
    }

    public function createContract(array $payload, User $actor): CcContract
    {
        $tenantId = (int) $actor->tenant_id;

        return DB::transaction(function () use ($payload, $actor, $tenantId) {
            $customer = CcCustomer::where('tenant_id', $tenantId)->findOrFail((int) $payload['customer_id']);
            $property = Property::where('tenant_id', $tenantId)->findOrFail((int) $payload['property_id']);

            $existing = CcContract::where('tenant_id', $tenantId)->where('property_id', $property->id)->first();
            if ($existing) {
                throw ValidationException::withMessages(['property_id' => 'This unit already has a contract.']);
            }

            $customerUnitId = $payload['customer_unit_id'] ?? null;
            $customerUnit = null;
            if ($customerUnitId) {
                $customerUnit = CcCustomerUnit::where('tenant_id', $tenantId)->findOrFail((int) $customerUnitId);
            } else {
                $customerUnit = CcCustomerUnit::where('tenant_id', $tenantId)
                    ->where('customer_id', $customer->id)
                    ->where('property_id', $property->id)
                    ->first();
            }

            if (!$customerUnit) {
                throw ValidationException::withMessages(['customer_unit_id' => 'Customer unit link is required before creating a contract.']);
            }

            $plan = CcPaymentPlanVersion::where('tenant_id', $tenantId)
                ->where('customer_unit_id', $customerUnit->id)
                ->where('is_active', true)
                ->latest('version')
                ->first();

            if (!$plan) {
                throw ValidationException::withMessages(['payment_plan' => 'Active payment plan is required to create a contract.']);
            }

            $contractDate = $payload['contract_date'] ?? now()->toDateString();
            $firstDueDate = $payload['first_due_date'] ?? $contractDate;

            $totalPrice = (float) ($payload['total_price'] ?? 0);
            if ($totalPrice <= 0) {
                $totalPrice = (float) ($property->price ?? 0);
            }
            if ($totalPrice <= 0) {
                throw ValidationException::withMessages(['total_price' => 'Total price is required (or property price must be set).']);
            }

            $snapshot = [
                'payment_plan_version_id' => $plan->id,
                'reservation_amount' => (float) $plan->reservation_amount,
                'down_payment' => (float) $plan->down_payment,
                'delivery_payment' => (float) $plan->delivery_payment,
                'installment_type' => $plan->installment_type,
                'installment_count' => (int) $plan->installment_count,
                'installment_value' => (float) $plan->installment_value,
            ];

            $contract = CcContract::create([
                'tenant_id' => $tenantId,
                'customer_id' => $customer->id,
                'customer_unit_id' => $customerUnit->id,
                'property_id' => $property->id,
                'contract_number' => $payload['contract_number'] ?? null,
                'contract_date' => $contractDate,
                'first_due_date' => $firstDueDate,
                'total_price' => $totalPrice,
                'payment_plan_snapshot' => $snapshot,
                'status' => 'active',
            ]);

            if (!$contract->contract_number) {
                $contract->contract_number = sprintf('CC-%d-%06d', $tenantId, (int) $contract->id);
                $contract->save();
            }

            $this->generateInstallments($contract);

            $customerUnit->status = 'contracted';
            $customerUnit->contracted_at = $customerUnit->contracted_at ?: now();
            $customerUnit->save();

            $this->syncPropertyOnContract($contract, $actor);

            try {
                activity('contract_collections')
                    ->causedBy($actor)
                    ->performedOn($contract)
                    ->withProperties([
                        'action' => 'contract_created',
                        'contract_id' => $contract->id,
                        'property_id' => $contract->property_id,
                        'snapshot' => $snapshot,
                    ])
                    ->log('cc_contract_created');
            } catch (\Throwable $e) {
            }

            return $contract->load(['customer', 'property', 'installments']);
        });
    }

    public function generateInstallments(CcContract $contract): void
    {
        $snapshot = is_array($contract->payment_plan_snapshot) ? $contract->payment_plan_snapshot : [];
        $count = (int) ($snapshot['installment_count'] ?? 0);
        if ($count <= 0) {
            return;
        }

        $type = strtolower((string) ($snapshot['installment_type'] ?? 'monthly'));
        $firstDue = $contract->first_due_date ?: $contract->contract_date ?: now()->toDateString();
        $firstDue = \Carbon\Carbon::parse($firstDue)->startOfDay();

        $total = (float) $contract->total_price;
        $remaining = $total
            - (float) ($snapshot['reservation_amount'] ?? 0)
            - (float) ($snapshot['down_payment'] ?? 0)
            - (float) ($snapshot['delivery_payment'] ?? 0);
        if ($remaining < 0) $remaining = 0;

        $value = (float) ($snapshot['installment_value'] ?? 0);
        if ($value <= 0 && $count > 0) {
            $value = $count > 0 ? round($remaining / $count, 2) : 0;
        }

        // Avoid duplicates on retries
        CcInstallment::where('tenant_id', $contract->tenant_id)->where('contract_id', $contract->id)->delete();

        for ($i = 1; $i <= $count; $i++) {
            $due = $this->addInterval(clone $firstDue, $type, $i - 1);

            CcInstallment::create([
                'tenant_id' => $contract->tenant_id,
                'contract_id' => $contract->id,
                'installment_number' => $i,
                'due_date' => $due->toDateString(),
                'amount' => $value,
                'paid_amount' => 0,
                'status' => 'pending',
            ]);
        }
    }

    public function payInstallment(CcInstallment $installment, array $payload, User $actor): array
    {
        $tenantId = (int) $actor->tenant_id;
        if ((int) $installment->tenant_id !== $tenantId) {
            throw ValidationException::withMessages(['installment_id' => 'Invalid installment for tenant.']);
        }

        return DB::transaction(function () use ($installment, $payload, $actor, $tenantId) {
            $installment->refresh();

            $amount = (float) ($payload['amount'] ?? 0);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Amount must be greater than 0.']);
            }

            $remaining = max(0.0, (float) $installment->amount - (float) $installment->paid_amount);
            if ($amount - $remaining > 0.00001) {
                throw ValidationException::withMessages(['amount' => 'Amount exceeds installment remaining balance.']);
            }

            $contract = $installment->contract()->lockForUpdate()->first();
            if (!$contract) {
                throw ValidationException::withMessages(['contract' => 'Missing contract.']);
            }

            $payment = CcPayment::create([
                'tenant_id' => $tenantId,
                'customer_id' => $contract->customer_id,
                'contract_id' => $contract->id,
                'amount' => $amount,
                'payment_method' => $payload['payment_method'] ?? null,
                'payment_date' => $payload['payment_date'] ?? now()->toDateString(),
                'reference_number' => $payload['reference_number'] ?? null,
                'notes' => $payload['notes'] ?? null,
                'status' => 'posted',
            ]);

            $alloc = CcPaymentAllocation::create([
                'tenant_id' => $tenantId,
                'payment_id' => $payment->id,
                'installment_id' => $installment->id,
                'amount_applied' => $amount,
            ]);

            $installment->paid_amount = (float) $installment->paid_amount + $amount;
            $installment->status = $this->deriveInstallmentStatus($installment);
            $installment->save();

            try {
                activity('contract_collections')
                    ->causedBy($actor)
                    ->performedOn($installment)
                    ->withProperties([
                        'action' => 'installment_paid',
                        'installment_id' => $installment->id,
                        'payment_id' => $payment->id,
                        'allocation_id' => $alloc->id,
                        'amount' => $amount,
                    ])
                    ->log('cc_installment_payment');
            } catch (\Throwable $e) {
            }

            return [
                'payment' => $payment->load('allocations'),
                'installment' => $installment->fresh(),
            ];
        });
    }

    public function voidPayment(CcPayment $payment, array $payload, User $actor, string $voidStatus = 'voided'): array
    {
        $tenantId = (int) $actor->tenant_id;
        if ((int) $payment->tenant_id !== $tenantId) {
            throw ValidationException::withMessages(['payment_id' => 'Invalid payment for tenant.']);
        }

        return DB::transaction(function () use ($payment, $payload, $actor, $tenantId, $voidStatus) {
            $payment = CcPayment::where('tenant_id', $tenantId)->lockForUpdate()->findOrFail($payment->id);

            $curStatus = strtolower((string) ($payment->status ?? ''));
            if (!in_array($curStatus, ['posted'], true)) {
                throw ValidationException::withMessages(['status' => 'Only posted payments can be voided/rejected.']);
            }

            $allocs = CcPaymentAllocation::where('tenant_id', $tenantId)
                ->where('payment_id', $payment->id)
                ->lockForUpdate()
                ->get();

            foreach ($allocs as $alloc) {
                $installment = CcInstallment::where('tenant_id', $tenantId)->lockForUpdate()->find($alloc->installment_id);
                if (!$installment) continue;

                $installment->paid_amount = max(0, (float) $installment->paid_amount - (float) $alloc->amount_applied);
                $installment->status = $this->deriveInstallmentStatus($installment);
                $installment->save();
            }

            $meta = is_array($payment->meta_data) ? $payment->meta_data : [];
            $meta['voided_at'] = now()->toDateTimeString();
            $meta['voided_by'] = $actor->id;
            $reason = trim((string) ($payload['reason'] ?? ''));
            if ($reason !== '') {
                $meta['void_reason'] = $reason;
            }

            $payment->status = $voidStatus;
            $payment->meta_data = $meta;
            $payment->save();

            try {
                activity('contract_collections')
                    ->causedBy($actor)
                    ->performedOn($payment)
                    ->withProperties([
                        'action' => $voidStatus === 'rejected' ? 'payment_rejected' : 'payment_voided',
                        'payment_id' => $payment->id,
                        'contract_id' => $payment->contract_id,
                        'amount' => (float) $payment->amount,
                        'reason' => $reason ?: null,
                    ])
                    ->log($voidStatus === 'rejected' ? 'cc_payment_rejected' : 'cc_payment_voided');
            } catch (\Throwable $e) {
            }

            return [
                'payment' => $payment->fresh(['allocations']),
            ];
        });
    }

    public function markInstallmentUnpaid(CcInstallment $installment, array $payload, User $actor): CcInstallment
    {
        $tenantId = (int) $actor->tenant_id;
        if ((int) $installment->tenant_id !== $tenantId) {
            throw ValidationException::withMessages(['installment_id' => 'Invalid installment for tenant.']);
        }

        return DB::transaction(function () use ($installment, $payload, $actor, $tenantId) {
            $installment = CcInstallment::where('tenant_id', $tenantId)->lockForUpdate()->findOrFail($installment->id);

            $amount = (float) $installment->amount;
            $paid = (float) $installment->paid_amount;
            if ($paid >= $amount - 0.00001) {
                throw ValidationException::withMessages(['status' => 'Cannot mark a fully paid installment as unpaid.']);
            }

            $meta = is_array($installment->meta_data) ? $installment->meta_data : [];
            $meta['marked_unpaid_at'] = now()->toDateTimeString();
            $meta['marked_unpaid_by'] = $actor->id;
            $reason = trim((string) ($payload['reason'] ?? ''));
            if ($reason !== '') {
                $meta['unpaid_reason'] = $reason;
            }

            $installment->meta_data = $meta;
            $installment->status = 'unpaid';
            $installment->save();

            try {
                activity('contract_collections')
                    ->causedBy($actor)
                    ->performedOn($installment)
                    ->withProperties([
                        'action' => 'installment_marked_unpaid',
                        'installment_id' => $installment->id,
                        'contract_id' => $installment->contract_id,
                        'reason' => $reason ?: null,
                    ])
                    ->log('cc_installment_marked_unpaid');
            } catch (\Throwable $e) {
            }

            return $installment->fresh();
        });
    }

    public function markOverdueForTenant(int $tenantId): int
    {
        $today = now()->toDateString();

        return CcInstallment::where('tenant_id', $tenantId)
            ->whereIn('status', ['pending', 'partial', 'unpaid'])
            ->whereDate('due_date', '<', $today)
            ->update(['status' => 'overdue', 'updated_at' => now()]);
    }

    protected function addInterval(\Carbon\Carbon $date, string $type, int $steps): \Carbon\Carbon
    {
        if ($steps <= 0) return $date;

        return match ($type) {
            'quarterly' => $date->addMonths(3 * $steps),
            'half-yearly', 'half_yearly', 'halfyearly' => $date->addMonths(6 * $steps),
            'yearly', 'annual', 'annually' => $date->addYears($steps),
            default => $date->addMonths($steps), // monthly
        };
    }

    protected function deriveInstallmentStatus(CcInstallment $installment): string
    {
        $paid = (float) $installment->paid_amount;
        $amount = (float) $installment->amount;
        $due = $installment->due_date ? \Carbon\Carbon::parse($installment->due_date)->startOfDay() : null;

        $current = strtolower((string) ($installment->status ?? ''));
        if ($paid >= $amount - 0.00001) {
            return 'paid';
        }
        if ($paid > 0) {
            return 'partial';
        }
        // Preserve explicit states when no money is paid (they may come from rejected/voided actions).
        if (in_array($current, ['rejected', 'unpaid'], true)) {
            if ($due && $due->lt(now()->startOfDay())) {
                return 'overdue';
            }
            return $current;
        }
        if ($due && $due->lt(now()->startOfDay())) {
            return 'overdue';
        }
        return 'pending';
    }

    protected function syncPropertyOnReservation(CcCustomerUnit $unit, User $actor): void
    {
        $property = $unit->property;
        if (!$property) return;

        $data = [];
        $data['status'] = 'Reserved';
        if (Schema::hasColumn($property->getTable(), 'reserved_at')) $data['reserved_at'] = now();
        if (Schema::hasColumn($property->getTable(), 'reserved_expires_at')) $data['reserved_expires_at'] = null;

        $leadId = $unit->customer?->lead_id;
        if (Schema::hasColumn($property->getTable(), 'reserved_lead_id')) {
            $data['reserved_lead_id'] = $leadId ? (int) $leadId : null;
        }
        if (Schema::hasColumn($property->getTable(), 'sold_at')) $data['sold_at'] = null;
        if (Schema::hasColumn($property->getTable(), 'sold_lead_id')) $data['sold_lead_id'] = null;

        $property->fill($data);
        $property->save();

        try {
            activity('contract_collections')
                ->causedBy($actor)
                ->performedOn($property)
                ->withProperties(['action' => 'property_reserved', 'property_id' => $property->id, 'cc_customer_unit_id' => $unit->id])
                ->log('cc_property_sync');
        } catch (\Throwable $e) {
        }
    }

    protected function syncPropertyOnContract(CcContract $contract, User $actor): void
    {
        $property = $contract->property;
        if (!$property) return;

        $data = [];
        $data['status'] = 'Sold';
        if (Schema::hasColumn($property->getTable(), 'sold_at')) $data['sold_at'] = now();

        $leadId = $contract->customer?->lead_id;
        if (Schema::hasColumn($property->getTable(), 'sold_lead_id')) {
            $data['sold_lead_id'] = $leadId ? (int) $leadId : null;
        }
        if (Schema::hasColumn($property->getTable(), 'reserved_at')) $data['reserved_at'] = null;
        if (Schema::hasColumn($property->getTable(), 'reserved_expires_at')) $data['reserved_expires_at'] = null;
        if (Schema::hasColumn($property->getTable(), 'reserved_lead_id')) $data['reserved_lead_id'] = null;

        $property->fill($data);
        $property->save();

        try {
            activity('contract_collections')
                ->causedBy($actor)
                ->performedOn($property)
                ->withProperties(['action' => 'property_sold', 'property_id' => $property->id, 'cc_contract_id' => $contract->id])
                ->log('cc_property_sync');
        } catch (\Throwable $e) {
        }
    }
}
