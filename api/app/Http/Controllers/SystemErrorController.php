<?php

namespace App\Http\Controllers;

use App\Models\SystemError;
use Illuminate\Http\Request;
use Carbon\Carbon;

class SystemErrorController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);

        $errors = SystemError::with('tenant')
            ->orderBy('last_seen_at', 'desc')
            ->paginate($perPage);

        $formatted = $errors->getCollection()->map(function ($error) {
            return [
                'id' => $error->id,
                'time' => $error->created_at->format('Y-m-d H:i'),
                'tenant' => $error->tenant ? $error->tenant->name : 'System',
                'service' => $error->service,
                'endpoint' => $error->endpoint,
                'status' => $error->status,
                'level' => $error->level,
                'count' => $error->count,
                'lastSeen' => $error->last_seen_at->diffForHumans(null, true, true), // "2m", "1h" style
            ];
        });

        return response()->json([
            'data' => $formatted,
            'meta' => [
                'current_page' => $errors->currentPage(),
                'last_page' => $errors->lastPage(),
                'per_page' => $errors->perPage(),
                'total' => $errors->total(),
                'from' => $errors->firstItem(),
                'to' => $errors->lastItem(),
            ],
        ]);
    }
}
