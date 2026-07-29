<?php

namespace App\Http\Middleware;

use App\Models\PersonalAccessToken;
use App\Services\AdminImpersonationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AttachImpersonationContext
{
    public function __construct(
        private readonly AdminImpersonationService $impersonationService
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        if (!$token) {
            $bearerToken = $request->bearerToken();
            if ($bearerToken) {
                $token = PersonalAccessToken::findToken($bearerToken);
            }
        }

        if (!$token) {
            return $next($request);
        }

        if (!$token instanceof PersonalAccessToken) {
            return $next($request);
        }

        $session = $this->impersonationService->currentForSupportToken($token);
        if (!$session) {
            return $next($request);
        }

        $this->impersonationService->attachContext($session, $request);

        return $next($request);
    }
}
