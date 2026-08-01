<?php

namespace App\Http\Controllers;

use App\Models\Visit;
use App\Models\Lead;
use App\Models\Broker;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class VisitController extends Controller
{
    use UserHierarchyTrait;

    private function normalizeToUtcDbString($value): ?string
    {
        if (!$value) {
            return null;
        }
        try {
            $dt = Carbon::parse($value);
            return $dt->copy()->utc()->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function rawUtcToIso(?string $raw): ?string
    {
        if (!$raw) {
            return null;
        }
        try {
            return Carbon::parse($raw, 'UTC')->toISOString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function durationMinutes(Visit $visit): ?int
    {
        $checkIn = $visit->getRawOriginal('check_in_at');
        $checkOut = $visit->getRawOriginal('check_out_at');
        if (!$checkIn || !$checkOut) {
            return null;
        }

        try {
            $start = Carbon::parse($checkIn, 'UTC');
            $end = Carbon::parse($checkOut, 'UTC');
            if ($end->lessThan($start)) {
                return null;
            }

            return $start->diffInMinutes($end);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function formatVisit(Visit $visit): array
    {
        return [
            'id' => $visit->id,
            'type' => $visit->type,
            'leadId' => $visit->lead_id,
            'taskId' => $visit->task_id,
            'brokerId' => $visit->broker_id,
            'brokerName' => $visit->broker_name,
            'customerId' => $visit->customer_id,
            'customerName' => $visit->customer_name,
            'salesPerson' => $visit->sales_person_name,
            'salesPersonId' => $visit->sales_person_id,
            'checkInDate' => $this->rawUtcToIso($visit->getRawOriginal('check_in_at')),
            'checkOutDate' => $this->rawUtcToIso($visit->getRawOriginal('check_out_at')),
            'durationMinutes' => $this->durationMinutes($visit),
            'location' => [
                'lat' => $visit->check_in_lat,
                'lng' => $visit->check_in_lng,
                'address' => $visit->check_in_address,
            ],
            'checkOutLocation' => [
                'lat' => $visit->check_out_lat,
                'lng' => $visit->check_out_lng,
                'address' => $visit->check_out_address,
            ],
            'status' => $visit->status,
        ];
    }

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $query = Visit::query();
        $viewableUserIds = $this->getViewableUserIds($user, $request->input('manager_id'));

        if (is_array($viewableUserIds) && !empty($viewableUserIds)) {
            $query->where(function ($scoped) use ($viewableUserIds) {
                $scoped->whereIn('sales_person_id', $viewableUserIds)
                    ->orWhere(function ($fallback) use ($viewableUserIds) {
                        $fallback->whereNull('sales_person_id')
                            ->whereIn('created_by', $viewableUserIds);
                    });
            });
        }

        if ($request->has('lead_id')) {
            $query->where('lead_id', $request->lead_id);
        }

        if ($request->has('task_id')) {
            $query->where('task_id', $request->task_id);
        }

        if ($request->has('broker_id')) {
            $query->where('broker_id', $request->broker_id);
        }

        if ($request->has('type') && $request->type) {
            $query->where('type', $request->type);
        }

        if ($request->has('status') && $request->status) {
            $query->where('status', $request->status);
        }

        $appTz = config('app.timezone') ?: 'UTC';
        if ($request->filled('from_date')) {
            try {
                $fromUtc = Carbon::parse($request->from_date, $appTz)->startOfDay()->utc()->format('Y-m-d H:i:s');
                $query->where('check_in_at', '>=', $fromUtc);
            } catch (\Throwable $e) {
            }
        }

        if ($request->filled('to_date')) {
            try {
                $toUtc = Carbon::parse($request->to_date, $appTz)->endOfDay()->utc()->format('Y-m-d H:i:s');
                $query->where('check_in_at', '<=', $toUtc);
            } catch (\Throwable $e) {
            }
        }

        $limit = (int) $request->input('limit', 2000);
        if ($limit <= 0) {
            $limit = 2000;
        }

        $visits = $query->orderByDesc('check_in_at')->limit($limit)->get();

        return $visits->map(fn (Visit $visit) => $this->formatVisit($visit));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $validator = Validator::make($request->all(), [
            'type' => 'required|string',
            'lead_id' => 'nullable|exists:leads,id',
            'broker_id' => 'nullable|exists:brokers,id',
            'task_id' => 'nullable|exists:tasks,id',
            'customer_id' => 'nullable|integer',
            'customer_name' => 'nullable|string',
            'broker_name' => 'nullable|string',
            'sales_person_id' => 'nullable|integer',
            'sales_person_name' => 'nullable|string',
            'check_in_date' => 'required|date',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'address' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $lead = null;
        if ($request->lead_id) {
            $lead = Lead::find($request->lead_id);
        }
        $broker = null;
        if ($request->broker_id) {
            $broker = Broker::find($request->broker_id);
        }

        $salesPersonId = $request->sales_person_id ?: $user->id;
        $salesPerson = User::find($salesPersonId);

        $visit = new Visit();
        $visit->lead_id = $request->lead_id;
        $visit->broker_id = $request->broker_id;
        $visit->task_id = $request->task_id;
        $visit->customer_id = $request->customer_id;
        $visit->type = $request->type;
        $visit->customer_name = $request->customer_name ?: ($lead ? $lead->name : null);
        $visit->broker_name = $request->broker_name ?: ($broker ? $broker->name : null);
        $visit->sales_person_id = $salesPerson ? $salesPerson->id : $user->id;
        $visit->sales_person_name = $request->sales_person_name ?: ($salesPerson ? $salesPerson->name : $user->name);
        $visit->check_in_at = $this->normalizeToUtcDbString($request->check_in_date);
        $visit->check_in_lat = $request->lat;
        $visit->check_in_lng = $request->lng;
        $visit->check_in_address = $request->address;
        $visit->status = 'pending';
        $visit->created_by = $user->id;

        $visit->save();

        return response()->json($this->formatVisit($visit), 201);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $visit = Visit::findOrFail($id);

        if ($request->has('status') && $request->status) {
            $visit->status = $request->status;
        }

        if ($request->has('check_out_date')) {
            $visit->check_out_at = $this->normalizeToUtcDbString($request->check_out_date);
        }

        if ($request->has('lat') || $request->has('lng') || $request->has('address')) {
            $visit->check_out_lat = $request->lat;
            $visit->check_out_lng = $request->lng;
            $visit->check_out_address = $request->address;
        }

        $visit->updated_by = $user->id;
        $visit->save();

        return response()->json($this->formatVisit($visit));
    }
}
