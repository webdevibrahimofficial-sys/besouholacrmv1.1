<?php

namespace App\Http\Controllers;

use App\Models\WebsiteIntakeLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebsiteIntakeLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $query = WebsiteIntakeLog::query()
            ->where('tenant_id', $tenantId)
            ->with([
                'connection:id,name',
                'lead:id,name,phone,email',
            ])
            ->latest('created_at');

        if ($request->filled('connection_id')) {
            $query->where('website_connection_id', (int) $request->integer('connection_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->string('status'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', (string) $request->string('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', (string) $request->string('date_to'));
        }

        $logs = $query
            ->paginate((int) min(max($request->integer('per_page', 25), 1), 100))
            ->appends($request->query());

        return response()->json($logs);
    }
}
