<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcCustomer;
use App\Models\CcCustomerUnit;
use App\Models\CcPaymentPlanVersion;
use App\Models\Lead;
use App\Models\Property;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CcLeadConversionController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function convertToCustomer(Request $request, int $leadId)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $lead = Lead::where('tenant_id', $tenantId)->findOrFail($leadId);

        $customer = CcCustomer::where('tenant_id', $tenantId)->where('lead_id', $lead->id)->first();

        if (!$customer) {
            $customer = CcCustomer::create([
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'project_id' => $lead->project_id ? (int) $lead->project_id : null,
                'sales_owner_id' => $lead->assigned_to ? (int) $lead->assigned_to : null,
                'name' => (string) ($lead->name ?? ''),
                'phone' => $lead->phone ? (string) $lead->phone : null,
                'email' => $lead->email ? (string) $lead->email : null,
                'source' => $lead->source ? (string) $lead->source : null,
                'last_comments' => 'Converted from Lead #' . $lead->id,
                'meta_data' => [
                    'created_from' => 'lead',
                    'lead_id' => (int) $lead->id,
                ],
            ]);
        }

        $propertyId = null;
        $unitId = (int) ($lead->unit_id ?? 0);
        if ($unitId > 0) {
            $propertyId = Property::where('tenant_id', $tenantId)->where('id', $unitId)->value('id');
        }
        if (!$propertyId) {
            // fallback: match by unit code/name stored on lead.unit
            $unitStr = trim((string) ($lead->unit ?? ''));
            if ($unitStr !== '') {
                $propertyId = Property::where('tenant_id', $tenantId)
                    ->where(function ($q) use ($unitStr) {
                        $q->where('unit_code', $unitStr)
                            ->orWhere('unit_number', $unitStr)
                            ->orWhere('name', $unitStr)
                            ->orWhere('title', $unitStr);
                    })
                    ->value('id');
            }
        }

        $unit = null;
        $plan = null;
        if ($propertyId && Schema::hasTable('cc_customer_units')) {
            $unit = CcCustomerUnit::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'customer_id' => $customer->id,
                    'property_id' => (int) $propertyId,
                ],
                [
                    'status' => 'reserved',
                    'reserved_at' => now(),
                    'meta_data' => [
                        'created_from' => 'lead',
                        'lead_id' => (int) $lead->id,
                    ],
                ]
            );

            $custMeta = is_array($customer->meta_data) ? $customer->meta_data : [];
            if (!isset($custMeta['primary_customer_unit_id']) || (int) $custMeta['primary_customer_unit_id'] <= 0) {
                $custMeta['primary_customer_unit_id'] = (int) $unit->id;
                $customer->meta_data = $custMeta;
                $customer->save();
            }

            // Seed payment plan if none exists yet
            if (Schema::hasTable('cc_payment_plan_versions')) {
                $plan = CcPaymentPlanVersion::where('tenant_id', $tenantId)
                    ->where('customer_unit_id', $unit->id)
                    ->where('is_active', true)
                    ->latest('version')
                    ->first();

                if (!$plan) {
                    $property = Property::where('tenant_id', $tenantId)->find($propertyId);
                    $leadMeta = is_array($lead->meta_data) ? $lead->meta_data : [];
                    $leadPlan = isset($leadMeta['payment_plan']) && is_array($leadMeta['payment_plan']) ? $leadMeta['payment_plan'] : null;

                    $propUnitNo = trim((string) ($property?->unit_code ?? $property?->unit_number ?? $property?->name ?? $property?->title ?? ''));
                    $leadUnitNo = $leadPlan ? trim((string) ($leadPlan['unitNo'] ?? $leadPlan['unit_no'] ?? '')) : '';

                    $useLeadPlan = $leadPlan && $leadUnitNo !== '' && $propUnitNo !== '' && strcasecmp($leadUnitNo, $propUnitNo) === 0;

                    if ($useLeadPlan) {
                        $baseAmount = (float) ($leadPlan['totalAmount'] ?? $leadPlan['total_amount'] ?? $leadPlan['netAmount'] ?? $leadPlan['net_amount'] ?? 0);
                        $downPayment = (float) ($leadPlan['downPayment'] ?? $leadPlan['down_payment'] ?? 0);
                        $delivery = (float) ($leadPlan['receiptAmount'] ?? $leadPlan['receipt_amount'] ?? $leadPlan['delivery_payment'] ?? 0);
                        $installmentType = $leadPlan['installmentType'] ?? $leadPlan['installment_type'] ?? 'monthly';
                        $count = (int) ($leadPlan['installmentCount'] ?? $leadPlan['installment_count'] ?? 0);
                        $value = (float) ($leadPlan['installmentAmount'] ?? $leadPlan['installment_amount'] ?? $leadPlan['installment_value'] ?? 0);

                        $plan = CcPaymentPlanVersion::create([
                            'tenant_id' => $tenantId,
                            'customer_unit_id' => $unit->id,
                            'version' => 1,
                            'is_active' => true,
                            'reservation_amount' => (float) ($leadPlan['reservationAmount'] ?? $leadPlan['reservation_amount'] ?? $property?->reservation_amount ?? 0),
                            'down_payment' => $downPayment,
                            'delivery_payment' => $delivery,
                            'installment_type' => $installmentType,
                            'installment_count' => $count > 0 ? $count : 0,
                            'installment_value' => $value,
                            'meta_data' => [
                                'created_from' => 'lead_payment_plan',
                                'lead_id' => (int) $lead->id,
                                'base_amount' => $baseAmount,
                            ],
                        ]);
                    } else {
                        $plans = is_array($property?->installment_plans) ? $property->installment_plans : [];
                        $first = is_array($plans) && count($plans) ? (array) $plans[0] : [];
                        if (!empty($first)) {
                            $basePrice = (float) ($property?->total_after_discount ?? $property?->net_amount ?? $property?->total_price ?? $property?->price ?? 0);
                            $dpType = strtolower((string) ($first['downPaymentType'] ?? $first['down_payment_type'] ?? ''));
                            $dpRaw = (float) ($first['downPayment'] ?? $first['down_payment'] ?? 0);
                            $downPayment = ($dpType === 'percentage' || $dpType === 'percent') ? ($basePrice * ($dpRaw / 100.0)) : $dpRaw;

                            $years = (int) ($first['years'] ?? 0);
                            $installmentCount = $years > 0 ? ($years * 12) : (int) ($first['installmentCount'] ?? $first['installment_count'] ?? 0);
                            $installmentValue = (float) ($first['installmentAmount'] ?? $first['installment_amount'] ?? $first['installment_value'] ?? 0);

                            $plan = CcPaymentPlanVersion::create([
                                'tenant_id' => $tenantId,
                                'customer_unit_id' => $unit->id,
                                'version' => 1,
                                'is_active' => true,
                                'reservation_amount' => (float) ($first['reservationAmount'] ?? $first['reservation_amount'] ?? $property?->reservation_amount ?? 0),
                                'down_payment' => $downPayment,
                                'delivery_payment' => (float) ($first['receiptAmount'] ?? $first['receipt_amount'] ?? $first['delivery_payment'] ?? 0),
                                'installment_type' => $first['installmentType'] ?? $first['installment_type'] ?? 'monthly',
                                'installment_count' => $installmentCount > 0 ? $installmentCount : 0,
                                'installment_value' => $installmentValue,
                                'meta_data' => [
                                    'created_from' => 'property_installment_plans',
                                    'lead_id' => (int) $lead->id,
                                    'property_installment_plan' => $first,
                                    'base_price' => $basePrice,
                                    'years' => $years > 0 ? $years : null,
                                    'additional_payments' => $first['extraPayment'] ?? $first['extra_payment'] ?? null,
                                    'delivery_date' => $first['deliveryDate'] ?? $first['delivery_date'] ?? null,
                                ],
                            ]);
                        }
                    }
                }
            }
        }

        // Store backlink on lead meta_data (best effort)
        try {
            $meta = is_array($lead->meta_data) ? $lead->meta_data : [];
            $meta['cc_customer_id'] = (int) $customer->id;
            if ($unit) $meta['cc_customer_unit_id'] = (int) $unit->id;
            $lead->meta_data = $meta;
            $lead->save();
        } catch (\Throwable $e) {
        }

        return response()->json([
            'customer' => $customer->fresh(['project:id,name', 'salesOwner:id,name', 'units.property', 'units.activePaymentPlan']),
            'customer_unit' => $unit?->fresh(['property', 'activePaymentPlan']),
            'payment_plan' => $plan,
        ], 201);
    }
}

