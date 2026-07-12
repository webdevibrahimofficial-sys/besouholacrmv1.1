<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        [
            'prefix' => 'api',
            'middleware' => [
                'api',
                \App\Http\Middleware\ResolveTenant::class,
                'auth:sanctum',
                \App\Http\Middleware\InitializeTenancy::class,
                \App\Http\Middleware\TrackUserPresence::class,
                \App\Http\Middleware\SetTenantTimezone::class,
                \App\Http\Middleware\EnsureTenantSubscriptionActive::class,
                'check_api_key_expiration',
                'throttle:api',
            ],
        ],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');

        // Disabling CORS in production breaks browser requests (Axios "Network Error" due to blocked CORS).
        // Only allow disabling CORS in local/testing to avoid accidental prod outages.
        $disableCors = (bool) env('DISABLE_LARAVEL_CORS', false);
        if ($disableCors && app()->environment(['local', 'testing'])) {
            $middleware->remove(\Illuminate\Http\Middleware\HandleCors::class);
        }
        
        // Increase throttle limit for API to prevent 429 errors
        $middleware->throttleApi('1000,1');

        $middleware->prependToPriorityList(
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            \App\Http\Middleware\ResolveTenant::class
        );

        $middleware->appendToPriorityList(
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
            \App\Http\Middleware\AttachImpersonationContext::class
        );

        $middleware->validateCsrfTokens(except: [
            'broadcasting/auth',
            'api/broadcasting/auth',
        ]);
        
        $middleware->alias([
            'check_api_key_expiration' => \App\Http\Middleware\CheckApiKeyExpiration::class,
            'csp' => \App\Http\Middleware\ContentSecurityPolicy::class,
            'ensure.super_admin' => \App\Http\Middleware\EnsureSuperAdmin::class,
            'impersonation.active' => \App\Http\Middleware\EnsureActiveImpersonationSession::class,
            'impersonation.restrict' => \App\Http\Middleware\PreventDangerousImpersonatedActions::class,
        ]);

        $middleware->web(append: [
            \App\Http\Middleware\ContentSecurityPolicy::class,
        ]);

        $middleware->api(append: [
            // \App\Http\Middleware\InitializeTenancy::class, // Moved to route middleware
            \App\Http\Middleware\ApplyTenantSmtpSettings::class,
            \App\Http\Middleware\ContentSecurityPolicy::class,
            \App\Http\Middleware\NormalizeCorsHeaders::class,
            \App\Http\Middleware\AttachImpersonationContext::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->report(function (Throwable $e) {
            try {
                // Skip console errors (can be enabled later if needed)
                if (app()->runningInConsole()) {
                    return;
                }

                // Blacklist: skip common noise errors
                $blacklist = [
                    \Illuminate\Session\TokenMismatchException::class,
                    \Symfony\Component\HttpKernel\Exception\NotFoundHttpException::class,
                    \Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException::class,
                    \Illuminate\Routing\Exceptions\BackedEnumCaseNotFoundException::class,
                ];
                foreach ($blacklist as $class) {
                    if ($e instanceof $class) {
                        return;
                    }
                }

                // Skip 429 (Too Many Requests) to avoid logging throttle hits
                $status = 500;
                if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                    $status = $e->getStatusCode();
                } elseif ($e->getCode() && is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600) {
                    $status = $e->getCode();
                }
                if ($status === 429) {
                    return;
                }

                $tenantId = null;
                if (app()->bound('current_tenant_id')) {
                    $tenantId = app('current_tenant_id');
                } elseif (Auth::check() && Auth::user()->tenant_id) {
                    $tenantId = Auth::user()->tenant_id;
                }

                // Determine error level
                $level = 'error';
                if ($e instanceof \Illuminate\Auth\AuthenticationException || $e instanceof \Illuminate\Validation\ValidationException) {
                    $level = 'warning';
                }

                $service = request()->path();
                $endpoint = request()->method() . ' ' . request()->fullUrl();
                $message = $e->getMessage() ?: class_basename($e);
                $errorClass = get_class($e);

                // Improved fingerprint: includes error class for better grouping
                $fingerprint = hash('sha256', implode('|', [
                    $tenantId ?? 'system',
                    $service,
                    request()->method(),
                    $status,
                    $level,
                    $errorClass,
                    Str::limit($message, 200, ''),
                ]));

                // Simple rate limit: max 1 insert/update per fingerprint per minute
                // to avoid DB hammering during rapid repeated errors
                $rateLimitKey = 'sys_error_rl:' . $fingerprint;
                $recentlyLogged = \Illuminate\Support\Facades\Cache::get($rateLimitKey);

                $query = \App\Models\SystemError::query()
                    ->where('fingerprint', $fingerprint)
                    ->whereNull('resolved_at');

                if ($tenantId === null) {
                    $query->whereNull('tenant_id');
                } else {
                    $query->where('tenant_id', $tenantId);
                }

                $existingError = $query->first();

                if ($existingError) {
                    $existingError->forceFill([
                        'service' => $service,
                        'endpoint' => $endpoint,
                        'message' => $message,
                        'stack_trace' => $e->getTraceAsString(),
                        'status' => $status,
                        'level' => $level,
                        'last_seen_at' => now(),
                        'count' => $existingError->count + 1,
                    ])->save();
                } else {
                    $newError = \App\Models\SystemError::create([
                        'tenant_id' => $tenantId,
                        'fingerprint' => $fingerprint,
                        'service' => $service,
                        'endpoint' => $endpoint,
                        'message' => $message,
                        'stack_trace' => $e->getTraceAsString(),
                        'status' => $status,
                        'level' => $level,
                        'last_seen_at' => now(),
                        'count' => 1,
                    ]);

                    // Dispatch alert for new critical errors (level = error, status >= 500)
                    if ($level === 'error' && $status >= 500) {
                        try {
                            \Illuminate\Support\Facades\Bus::dispatch(
                                new \App\Jobs\NotifySystemErrorCreated($newError)
                            );
                        } catch (\Throwable $dispatchError) {
                            // Silently fail to avoid breaking the request
                        }
                    }
                }

                // Update rate limit cache
                if (! $recentlyLogged) {
                    \Illuminate\Support\Facades\Cache::put($rateLimitKey, true, 60);
                }
            } catch (\Throwable $loggingError) {
                // Fail silently to avoid infinite loop
            }
        });
    })->create();
