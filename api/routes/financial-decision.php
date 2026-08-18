<?php

use App\Http\Controllers\FinancialDecisionController;
use App\Http\Middleware\EnsureTenantSubscriptionActive;
use App\Http\Middleware\InitializeTenancy;
use App\Http\Middleware\ResolveTenant;
use App\Http\Middleware\SetTenantTimezone;
use App\Http\Middleware\TrackUserPresence;
use Illuminate\Support\Facades\Route;

Route::middleware([
    ResolveTenant::class,
    'auth:sanctum',
    InitializeTenancy::class,
    TrackUserPresence::class,
    SetTenantTimezone::class,
    EnsureTenantSubscriptionActive::class,
    'check_api_key_expiration',
    'throttle:api',
    'tenant.feature:financial_decision_engine',
])->prefix('api')->group(function () {
    Route::post('/ai/copilot/financial/evaluate', [FinancialDecisionController::class, 'evaluate']);
    Route::get('/financial-decision/settings', [FinancialDecisionController::class, 'showSettings']);
    Route::put('/financial-decision/settings', [FinancialDecisionController::class, 'updateSettings']);
});
