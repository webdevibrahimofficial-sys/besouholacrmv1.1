<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveImpersonationSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!app()->bound('impersonation_session')) {
            return response()->json([
                'message' => 'No active support access session.',
                'code' => 'NO_ACTIVE_IMPERSONATION_SESSION',
            ], 401);
        }

        return $next($request);
    }
}
