<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PreventDangerousImpersonatedActions
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!app()->bound('impersonation_session')) {
            return $next($request);
        }

        return response()->json([
            'message' => 'This action is restricted during support access session.',
            'code' => 'IMPERSONATION_ACTION_RESTRICTED',
        ], 403);
    }
}
