<?php

use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Admin\FieldController;
use App\Http\Controllers\LeadController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\BrokerController;
use App\Http\Controllers\PropertyController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentTermController;
use App\Http\Controllers\InventoryRequestController;
use App\Http\Controllers\TenantRegistrationController;
use App\Http\Controllers\SuperAdminController;
use App\Http\Controllers\SuperAdminUserController;
use App\Http\Controllers\SuperAdminImpersonationController;
use App\Http\Controllers\SuperAdminBackupController;
use App\Http\Controllers\SubscriptionTransactionController;
use App\Http\Controllers\TenantSubscriptionContractController;
use App\Http\Controllers\PlanPriceController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\AccessLogController;
use App\Http\Controllers\QuotationController;
use App\Http\Controllers\OpportunityController;
use App\Http\Controllers\MagicLinkController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\TenantModuleController;
use App\Http\Controllers\OauthController;
use App\Http\Controllers\GmailController;
use App\Http\Controllers\GeminiController;
use App\Http\Controllers\PublicFileController;
use App\Http\Controllers\PublicWebsiteAssetController;
use App\Http\Controllers\MetaWebhookController;
use App\Http\Controllers\MetaLeadFormController;
use App\Http\Controllers\Internal\WhatsappMirrorWebhookController;
use App\Http\Controllers\Api\WhatsappMirrorController;
use App\Http\Controllers\ExcelImportController;
use App\Http\Controllers\ImportJobController;
use App\Http\Controllers\TenantConfigController;
use App\Http\Controllers\CrmSettingsController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\SuperAdminNotificationController;
use App\Http\Controllers\DeviceTokenController;
use App\Http\Controllers\ShareLinkController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\TelesalesController;
use App\Http\Controllers\ContractCollections\CcCustomersController;
use App\Http\Controllers\ContractCollections\CcCustomerUnitsController;
use App\Http\Controllers\ContractCollections\CcContractsController;
use App\Http\Controllers\ContractCollections\CcContractAttachmentsController;
use App\Http\Controllers\ContractCollections\CcInstallmentsController;
use App\Http\Controllers\ContractCollections\CcPrintController;
use App\Http\Controllers\ContractCollections\CcPaymentsController;
use App\Http\Controllers\ContractCollections\CcAuditController;
use App\Http\Controllers\ContractCollections\CcLeadConversionController;
use App\Http\Controllers\ContractCollections\CcCustomerCommentsController;
use App\Http\Controllers\WhatsappMirrorGroupContactController;
use App\Http\Controllers\WhatsappMirrorUnassignedContactController;
use App\Http\Middleware\ResolveTenant;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\InitializeTenancy;
use App\Http\Middleware\SetTenantTimezone;
use App\Http\Middleware\EnsureTenantSubscriptionActive;

/* |-------------------------------------------------------------------------- | API Routes |-------------------------------------------------------------------------- | | Here is where you can register API routes for your application. These | routes are loaded by the RouteServiceProvider and all of them will | be assigned to the "api" middleware group. Make something great! | */

// Preflight: ensure all OPTIONS requests under /api/* return 204 with CORS headers
Route::options('/{any}', function (Request $request) {
    return response()->noContent();
})->where('any', '.*')
  ->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]);

// ==================================================================================
// Central Domain Routes (e.g., app.domain.com or root domain)
// ==================================================================================

// Fallback login route to prevent "Route [login] not defined" 500 error for API requests
Route::get('/login', function () {
    return response()->json(['message' => 'Unauthenticated.'], 401);
})->name('login');

// Tenant Registration
Route::post('/tenants/register', [TenantRegistrationController::class , 'register'])
    ->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]);
// NOTE: These auth endpoints must stay reachable even if Redis / cache is temporarily misconfigured.
// Throttling depends on the cache store (often Redis). If the cache store is down, throttling can throw and turn
// logins into HTTP 500. We explicitly disable the throttle middleware here and rely on upstream WAF/rate-limits.
Route::post('/login', [AuthController::class , 'login'])
    ->middleware([ResolveTenant::class, InitializeTenancy::class])
    ->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]); // Generic Login (Central)
Route::post('/auth/2fa/verify', [AuthController::class , 'verifyTwoFactor'])
    ->middleware([ResolveTenant::class, InitializeTenancy::class])
    ->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]);
Route::post('/crm/login-redirect', [AuthController::class , 'loginRedirect'])
    ->middleware([ResolveTenant::class, InitializeTenancy::class])
    ->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]);
Route::get('/meta/webhook', [MetaWebhookController::class , 'verify']);
Route::post('/meta/webhook', [MetaWebhookController::class , 'receive']);
Route::post('/meta/mock/webhook/{page_id}', [\App\Http\Controllers\MetaMockController::class, 'triggerMockLead']);
Route::post('/internal/mock/google-ads/campaigns/{tenant}', [\App\Http\Controllers\GoogleMockController::class, 'triggerMockCampaigns']);
Route::post('/internal/mock/google-ads/leads/{tenant}', [\App\Http\Controllers\GoogleMockController::class, 'triggerMockLeads']);
Route::post('/mock/tenant/{tenant}/google-ads/{account}/campaigns', [\App\Http\Controllers\GoogleMockController::class, 'triggerMockCampaigns']);
Route::post('/mock/tenant/{tenant}/google-ads/{account}/leads', [\App\Http\Controllers\GoogleMockController::class, 'triggerMockLeads']);
Route::post('/google/webhook', [\App\Http\Controllers\GoogleWebhookController::class, 'receive']);
Route::get('/auth/google/callback', [\App\Http\Controllers\GoogleAuthController::class, 'callback']);
Route::get('/auth/meta/callback', [\App\Http\Controllers\MetaAuthController::class, 'callback'])->name('meta.callback');
Route::get('/auth/whatsapp/callback', [\App\Http\Controllers\WhatsappMetaAuthController::class, 'callback'])->name('whatsapp.meta.callback');
Route::post('/facebook/data-deletion', [\App\Http\Controllers\MetaDataDeletionController::class, 'handle']);
Route::get('/facebook/data-deletion/status', [\App\Http\Controllers\MetaDataDeletionController::class, 'status']);
Route::get('/whatsapp/webhook', [\App\Http\Controllers\WhatsappWebhookController::class , 'verify']);
Route::post('/whatsapp/webhook', [\App\Http\Controllers\WhatsappWebhookController::class , 'receive']);
// Internal webhook for WhatsApp Mirror microservice (protected by internal token)
Route::post('/internal/whatsapp-mirror/webhook', [WhatsappMirrorWebhookController::class, 'handle']);
Route::post('/internal/whatsapp-mirror/history-sync', [WhatsappMirrorWebhookController::class, 'historySync']);
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/whatsapp/messages', [\App\Http\Controllers\WhatsappMessageController::class , 'index']);
    Route::post('/whatsapp/send-test', [\App\Http\Controllers\WhatsappMessageController::class , 'sendTest']);
});

// External/UI endpoints for Whatsapp Mirror (tenant context, authenticated)
Route::middleware([
    ResolveTenant::class,
    'auth:sanctum',
    InitializeTenancy::class,
    SetTenantTimezone::class,
    EnsureTenantSubscriptionActive::class,
])->prefix('whatsapp-mirror')->group(function () {
    Route::post('/pair', [WhatsappMirrorController::class, 'pair']);
    Route::get('/status', [WhatsappMirrorController::class, 'status']);
    Route::post('/disconnect', [WhatsappMirrorController::class, 'disconnect']);
    Route::get('/unassigned-contacts', [WhatsappMirrorUnassignedContactController::class, 'index']);
    Route::post('/unassigned-contacts/{contact}/convert-to-lead', [WhatsappMirrorUnassignedContactController::class, 'convertToLead']);
    Route::get('/group-contacts', [WhatsappMirrorGroupContactController::class, 'index']);
    Route::get('/group-contacts/groups', [WhatsappMirrorGroupContactController::class, 'storedGroups']);
    Route::post('/group-contacts/sync', [WhatsappMirrorGroupContactController::class, 'sync']);
    Route::delete('/group-contacts/{contact}', [WhatsappMirrorGroupContactController::class, 'destroy']);
    Route::post('/group-contacts/{contact}/convert-to-lead', [WhatsappMirrorGroupContactController::class, 'convertToLead']);
    Route::get('/admin-groups', [WhatsappMirrorGroupContactController::class, 'adminGroups']);
    Route::post('/group-contacts/{contact}/add-to-group', [WhatsappMirrorGroupContactController::class, 'addToGroup']);
    Route::post('/group-contacts/{contact}/send-invite', [WhatsappMirrorGroupContactController::class, 'sendInviteToGroup']);
    Route::post('/group-contacts/bulk-add-to-group', [WhatsappMirrorGroupContactController::class, 'bulkAddToGroup']);
    Route::get('/groups', [WhatsappMirrorGroupContactController::class, 'groups']);
});

// Secure File Serving (Signed URLs)
Route::get('/files/{path}', [\App\Http\Controllers\TenantFileController::class , 'show'])
    ->where('path', '.*')
    ->name('tenant.files.show');

Route::get('/whatsapp/media/{message}', [\App\Http\Controllers\WhatsappMessageController::class , 'streamMediaV1'])
    ->name('whatsapp.messages.media');

// Public disk files (used by PDF/image exports)
Route::get('/public-files/{path}', [PublicFileController::class , 'show'])
    ->where('path', '.*')
    ->name('public.files.show');

Route::get('/public-website-assets/{path}', [PublicWebsiteAssetController::class, 'show'])
    ->where('path', '.*')
    ->name('public.website-assets.show');

// Super Admin Routes (Accessible on main domain)
Route::prefix('super-admin')->middleware([ResolveTenant::class, 'auth:sanctum', EnsureSuperAdmin::class])->group(function () {
    Route::get('tenants', [SuperAdminController::class , 'tenants']);
    Route::post('tenants', [SuperAdminController::class , 'storeTenant']);
    Route::put('tenants/{tenant}', [SuperAdminController::class , 'update']);
    Route::post('tenants/{tenant}/archive', [SuperAdminController::class, 'archive']);
    Route::get('subscription-plans', [\App\Http\Controllers\SubscriptionPlanController::class, 'index']);
    Route::post('subscription-plans', [\App\Http\Controllers\SubscriptionPlanController::class, 'store']);
    Route::put('subscription-plans/{subscriptionPlan}', [\App\Http\Controllers\SubscriptionPlanController::class, 'update']);
    Route::delete('subscription-plans/{subscriptionPlan}', [\App\Http\Controllers\SubscriptionPlanController::class, 'destroy']);
    Route::get('task-categories', [\App\Http\Controllers\TaskCategoryController::class, 'index']);
    Route::post('task-categories', [\App\Http\Controllers\TaskCategoryController::class, 'store']);
    Route::put('task-categories/{taskCategory}', [\App\Http\Controllers\TaskCategoryController::class, 'update']);
    Route::delete('task-categories/{taskCategory}', [\App\Http\Controllers\TaskCategoryController::class, 'destroy']);
    Route::get('users', [SuperAdminController::class , 'users']);
    Route::get('admin-users', [SuperAdminUserController::class, 'index']);
    Route::post('admin-users', [SuperAdminUserController::class, 'store']);
    Route::put('admin-users/{user}', [SuperAdminUserController::class, 'update']);
    Route::delete('admin-users/{user}', [SuperAdminUserController::class, 'destroy']);
    Route::get('admin-roles', [SuperAdminUserController::class, 'rolesIndex']);
    Route::post('admin-roles', [SuperAdminUserController::class, 'storeRole']);
    Route::put('admin-roles/{role}', [SuperAdminUserController::class, 'updateRole']);
    Route::delete('admin-roles/{role}', [SuperAdminUserController::class, 'destroyRole']);
    Route::get('admin-permissions', [SuperAdminUserController::class, 'permissionsIndex']);
    Route::get('transactions', [SubscriptionTransactionController::class, 'index']);
    Route::post('transactions', [SubscriptionTransactionController::class, 'store']);
    Route::get('transactions/summary', [SubscriptionTransactionController::class, 'summary']);
    Route::get('transactions/export', [SubscriptionTransactionController::class, 'export']);
    Route::get('transactions/{id}', [SubscriptionTransactionController::class, 'show']);
    Route::put('transactions/{id}', [SubscriptionTransactionController::class, 'update']);
    Route::post('transactions/{id}/void', [SubscriptionTransactionController::class, 'void']);
    Route::get('tenants/{tenant}/contracts', [TenantSubscriptionContractController::class, 'index']);
    Route::post('tenants/{tenant}/contracts', [TenantSubscriptionContractController::class, 'store']);
    Route::get('plan-prices', [PlanPriceController::class, 'index']);
    Route::post('plan-prices', [PlanPriceController::class, 'store']);
    Route::put('plan-prices/{id}', [PlanPriceController::class, 'update']);

    // Audit Logs
    Route::get('logs', [ActivityLogController::class , 'index']);
    Route::get('logs/export', [ActivityLogController::class , 'export']);
    Route::get('system-errors', [\App\Http\Controllers\SystemErrorController::class, 'index']);
    Route::patch('system-errors/{systemError}/resolve', [\App\Http\Controllers\SystemErrorController::class, 'resolve']);

    // Tenant Module Management
    Route::get('tenants/{tenant}/modules', [TenantModuleController::class , 'index']);
    Route::put('tenants/{tenant}/modules', [TenantModuleController::class , 'update']);

    Route::get('tenants/quick-switch', [SuperAdminImpersonationController::class, 'quickSwitchTenants']);
    Route::post('tenants/{tenant}/impersonation', [SuperAdminImpersonationController::class, 'start']);
    Route::get('impersonation/current', [SuperAdminImpersonationController::class, 'current']);
    Route::delete('impersonation/current', [SuperAdminImpersonationController::class, 'destroy']);

    Route::get('backups/dashboard', [SuperAdminBackupController::class , 'dashboard']);
    Route::get('backups', [SuperAdminBackupController::class , 'history']);
    Route::get('backups/restores', [SuperAdminBackupController::class , 'restoreHistory']);
    Route::post('backups', [SuperAdminBackupController::class , 'store']);
    Route::get('backups/{backup}', [SuperAdminBackupController::class , 'show']);
    Route::get('backups/{backup}/download', [SuperAdminBackupController::class , 'downloadAny']);
    Route::post('backups/{backup}/restore', [SuperAdminBackupController::class , 'restore']);
    Route::delete('backups/{backup}', [SuperAdminBackupController::class , 'destroy']);
    Route::get('tenant-backups', [SuperAdminBackupController::class , 'dashboard']);
    Route::post('tenants/{tenant}/backups', [SuperAdminBackupController::class , 'backupNow']);
    Route::get('tenants/{tenant}/backups', [SuperAdminBackupController::class , 'listBackups']);
    Route::get('tenants/{tenant}/backups/{backup}/download', [SuperAdminBackupController::class , 'download']);

    // Global System Settings
    Route::get('settings', [\App\Http\Controllers\SystemSettingController::class, 'index']);
    Route::post('settings', [\App\Http\Controllers\SystemSettingController::class, 'update']);

    // Meta shared app health & webhook verification
    Route::get('meta/health', [\App\Http\Controllers\SuperAdminMetaController::class, 'health']);
    Route::post('meta/test-webhook', [\App\Http\Controllers\SuperAdminMetaController::class, 'testWebhook']);

    // Dashboard Stats
    Route::get('stats', [SuperAdminController::class, 'stats']);
});

// Super-admin notifications are intentionally isolated from tenant middleware.
Route::prefix('super-admin')->middleware(['auth:sanctum', EnsureSuperAdmin::class])->group(function () {
    Route::get('notifications', [SuperAdminNotificationController::class, 'index']);
    Route::get('notifications/unread-count', [SuperAdminNotificationController::class, 'unreadCount']);
    Route::post('notifications/{notification}/read', [SuperAdminNotificationController::class, 'markAsRead']);
    Route::post('notifications/read-all', [SuperAdminNotificationController::class, 'markAllAsRead']);
    Route::post('notifications/{notification}/archive', [SuperAdminNotificationController::class, 'archive']);
    Route::post('notifications/archive-all-read', [SuperAdminNotificationController::class, 'archiveAllRead']);

    Route::get('notification-settings', [SuperAdminNotificationController::class, 'settingsShow']);
    Route::put('notification-settings', [SuperAdminNotificationController::class, 'settingsUpdate']);

    Route::post('push/subscribe', [SuperAdminNotificationController::class, 'subscribePush']);
    Route::delete('push/unsubscribe', [SuperAdminNotificationController::class, 'unsubscribePush']);
});

// ==================================================================================
// 2. Tenant Domain Routes (Accessible via subdomain OR header on localhost)
// ==================================================================================

// Public Landing Page (Global Access)
Route::get('/p/{slug}', [\App\Http\Controllers\LandingPageController::class, 'showPublic']);
Route::post('/p/{slug}/lead', [\App\Http\Controllers\LandingPageController::class, 'storeLead']);
Route::post('/intake/website/{apiKey}', [\App\Http\Controllers\WebsiteIntakeController::class, 'store'])
    ->middleware('throttle:60,1');
Route::post('/intake/website/{apiKey}/career-application', [\App\Http\Controllers\WebsiteCareerApplicationController::class, 'store'])
    ->middleware('throttle:20,1');
Route::get('/public/lead-leak-reports/{tenantId}/{leadId}/{filename}', [\App\Http\Controllers\WebsiteIntakeController::class, 'downloadLeadLeakReport'])
    ->whereNumber('tenantId')
    ->whereNumber('leadId')
    ->where('filename', 'lead-leak-report-[0-9]+\.pdf')
    ->middleware('throttle:60,1');
Route::get('/public/website/{tenantSlug}', [\App\Http\Controllers\PublicWebsiteContentController::class, 'show'])
    ->middleware('throttle:60,1');
Route::post('/public/website/events', [\App\Http\Controllers\PublicWebsiteEventController::class, 'store'])
    ->middleware('throttle:120,1');

Route::middleware([ResolveTenant::class])
    ->group(function () {
        // Authentication
        Route::post('/auth/login', [AuthController::class , 'login']);
        Route::post('/auth/2fa/verify', [AuthController::class , 'verifyTwoFactor']);
        Route::post('/impersonation/exchange', [\App\Http\Controllers\ImpersonationController::class, 'exchange']);

        // Magic Link (Tenant Context)
        Route::post('/login/magic', [MagicLinkController::class , 'send']);
        Route::get('/login/magic/verify/{id}', [MagicLinkController::class , 'verify'])->name('magic.verify');

        // Password Reset (Tenant Context)
        Route::post('/password/email', [App\Http\Controllers\PasswordResetController::class , 'sendResetLink']);
        Route::post('/password/reset', [App\Http\Controllers\PasswordResetController::class , 'reset']);

        // Public Share Links (Landing Preview)
        Route::get('/share-links/{token}', [ShareLinkController::class, 'show']);
    });

// Protected Routes (Accessible via any domain, Tenant context resolved via Auth)
Route::middleware([
     ResolveTenant::class ,
      'auth:sanctum',
      InitializeTenancy::class ,
      \App\Http\Middleware\TrackUserPresence::class,
      SetTenantTimezone::class ,
     EnsureTenantSubscriptionActive::class,
    'check_api_key_expiration',
    'throttle:api',
])->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/impersonation/current', [\App\Http\Controllers\ImpersonationController::class, 'current']);
    Route::delete('/impersonation/current', [\App\Http\Controllers\ImpersonationController::class, 'destroy'])->middleware('impersonation.active');

    Route::get('/tenant-config', [TenantConfigController::class , 'show']);
    Route::get('/crm-settings', [CrmSettingsController::class , 'show']);
    Route::put('/crm-settings', [CrmSettingsController::class , 'update']);

    // Notifications
    Route::post('/push/subscribe', [NotificationController::class , 'subscribe']);
    Route::post('/trigger-notification', [NotificationController::class , 'trigger']);
    Route::post('/device-tokens', [DeviceTokenController::class, 'store']);
    Route::delete('/device-tokens', [DeviceTokenController::class, 'destroy']);
    Route::post('/device-tokens/test-notification', [DeviceTokenController::class, 'testNotification']);

    Route::post('/oauth/google/exchange', [OauthController::class , 'exchange']);
    Route::post('/oauth/google/revoke', [OauthController::class , 'revoke']);
    Route::get('/gmail/labels', [GmailController::class , 'labels']);
    Route::post('/gemini/icon-suggestions', [GeminiController::class , 'iconSuggestions']);
    Route::post('/gemini/generate-icon', [GeminiController::class , 'generateIcon']);

    Route::post('/share-links', [ShareLinkController::class, 'store']);

    Route::get('/website-connections', [\App\Http\Controllers\WebsiteConnectionController::class, 'index']);
    Route::post('/website-connections', [\App\Http\Controllers\WebsiteConnectionController::class, 'store']);
    Route::put('/website-connections/{websiteConnection}', [\App\Http\Controllers\WebsiteConnectionController::class, 'update']);
    Route::delete('/website-connections/{websiteConnection}', [\App\Http\Controllers\WebsiteConnectionController::class, 'destroy']);
    Route::post('/website-connections/{websiteConnection}/regenerate-key', [\App\Http\Controllers\WebsiteConnectionController::class, 'regenerateKey']);
    Route::get('/website-connections/{websiteConnection}/stats', [\App\Http\Controllers\WebsiteConnectionController::class, 'stats']);
    Route::post('/website-connections/{websiteConnection}/test', [\App\Http\Controllers\WebsiteConnectionController::class, 'test']);
    Route::get('/website-intake-logs', [\App\Http\Controllers\WebsiteIntakeLogController::class, 'index']);

    Route::prefix('system/company-website')
        ->middleware('ensure.super_admin')
        ->group(function () {
            Route::get('/settings', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'showSettings']);
            Route::put('/settings', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'updateSettings']);
            Route::get('/homepage-sections', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'indexSections']);
            Route::put('/homepage-sections/{websiteHomepageSection}', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'updateSection']);
            Route::post('/homepage-sections/reorder', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'reorderSections']);
            Route::get('/services', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'indexServices']);
            Route::post('/services', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'storeService']);
            Route::put('/services/{websiteService}', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'updateService']);
            Route::delete('/services/{websiteService}', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'destroyService']);
            Route::get('/careers/page', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'showCareerPage']);
            Route::put('/careers/page', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'updateCareerPage']);
            Route::get('/careers/roles', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'indexCareerRoles']);
            Route::post('/careers/roles', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'storeCareerRole']);
            Route::put('/careers/roles/{websiteCareerRole}', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'updateCareerRole']);
            Route::delete('/careers/roles/{websiteCareerRole}', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'destroyCareerRole']);
            Route::get('/careers/applications', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'indexCareerApplications']);
            Route::get('/analytics/overview', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'analyticsOverview']);
            Route::get('/analytics/pages', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'analyticsPages']);
            Route::get('/analytics/forms', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'analyticsForms']);
            Route::get('/analytics/campaigns', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'analyticsCampaigns']);
            Route::get('/analytics/filter-options', [\App\Http\Controllers\SystemCompanyWebsiteController::class, 'analyticsFilterOptions']);
        });

    // Contract & Collections (Real Estate)
    Route::prefix('cc')->group(function () {
        Route::apiResource('customers', CcCustomersController::class, [
            'names' => [
                'index' => 'cc.customers.index',
                'store' => 'cc.customers.store',
                'show' => 'cc.customers.show',
                'update' => 'cc.customers.update',
                'destroy' => 'cc.customers.destroy',
            ],
        ])->except(['create', 'edit']);
        Route::get('customers/{customerId}/comments', [CcCustomerCommentsController::class, 'index']);
        Route::post('customers/{customerId}/comments', [CcCustomerCommentsController::class, 'store']);
        Route::post('customer-units', [CcCustomerUnitsController::class, 'store']);
        Route::put('customer-units/{id}', [CcCustomerUnitsController::class, 'update']);
        Route::post('customer-units/{id}/payment-plan', [CcCustomerUnitsController::class, 'createPaymentPlanVersion']);

        Route::get('contracts', [CcContractsController::class, 'index']);
        Route::post('contracts', [CcContractsController::class, 'store']);
        Route::get('contracts/{id}', [CcContractsController::class, 'show']);
        Route::put('contracts/{id}/template', [CcContractsController::class, 'setTemplate']);
        Route::post('contracts/{id}/payment-plan', [CcContractsController::class, 'updatePaymentPlan']);
        Route::delete('contracts/{id}', [CcContractsController::class, 'destroy']);
        Route::get('contracts/{id}/print', [CcPrintController::class, 'printContract']);
        Route::get('contracts/{id}/attachments', [CcContractAttachmentsController::class, 'index']);
        Route::post('contracts/{id}/attachments', [CcContractAttachmentsController::class, 'store']);
        Route::delete('contracts/{id}/attachments/{attachmentId}', [CcContractAttachmentsController::class, 'destroy']);

        Route::get('installments', [CcInstallmentsController::class, 'index']);
        Route::post('installments/{id}/pay', [CcInstallmentsController::class, 'pay']);
        Route::post('installments/{id}/reschedule', [CcInstallmentsController::class, 'reschedule']);
        Route::post('installments/{id}/mark-unpaid', [CcInstallmentsController::class, 'markUnpaid']);

        Route::post('payments/{id}/void', [CcPaymentsController::class, 'void']);
        Route::post('payments/{id}/reject', [CcPaymentsController::class, 'reject']);

        Route::get('audit/customer-units/{id}', [CcAuditController::class, 'customerUnit']);
        Route::post('leads/{leadId}/convert-to-customer', [CcLeadConversionController::class, 'convertToCustomer']);

        Route::get('receipts/{paymentId}/print', [CcPrintController::class, 'printReceipt']);
        Route::get('receipts/installments/{installmentId}/print', [CcPrintController::class, 'printInstallmentReceipt']);
    });

    // Meta Integration
    Route::get('/auth/meta/redirect', [\App\Http\Controllers\MetaAuthController::class, 'redirect']);
    Route::post('/auth/meta/callback', [\App\Http\Controllers\MetaAuthController::class, 'callback']);
    Route::get('/auth/meta/status', [\App\Http\Controllers\MetaAuthController::class, 'status']);
    Route::post('/auth/meta/settings', [\App\Http\Controllers\MetaAuthController::class, 'updateSettings']);
    Route::post('/auth/meta/disconnect', [\App\Http\Controllers\MetaAuthController::class, 'disconnect']);
    Route::post('/auth/meta/sync', [\App\Http\Controllers\MetaAuthController::class, 'sync']);
    Route::post('/auth/meta/asset/toggle', [\App\Http\Controllers\MetaAuthController::class, 'toggleAsset']);
    Route::post('/auth/meta/asset/delete', [\App\Http\Controllers\MetaAuthController::class, 'deleteAsset']);
    Route::post('/auth/meta/page/link', [\App\Http\Controllers\MetaAuthController::class, 'linkPage']);
    Route::get('/auth/meta/forms', [MetaLeadFormController::class, 'index']);
    Route::get('/auth/meta/forms/{formId}/suggest-mapping', [MetaLeadFormController::class, 'suggestMapping']);
    Route::post('/auth/meta/forms/map', [MetaLeadFormController::class, 'map']);
    Route::post('/auth/meta/test-webhook', [\App\Http\Controllers\MetaAuthController::class, 'testWebhook']);
    Route::get('/auth/meta/health', [\App\Http\Controllers\MetaAuthController::class, 'health']);
    Route::post('/meta/capi/test', [\App\Http\Controllers\MetaCapiController::class, 'test']);
    
    // Meta Mock Mode Routes
    Route::post('/meta/mock/leads/{tenantId}', [\App\Http\Controllers\MetaMockController::class, 'triggerMockLead']);

    // Google Ads Mock Mode Routes
    // Google Ads Multi-Account Management
    Route::prefix('tenant/{tenant_id}/google-ads')->group(function () {
        Route::post('/connect', [\App\Http\Controllers\GoogleAdsAccountController::class, 'connect']);
        Route::get('/accounts', [\App\Http\Controllers\GoogleAdsAccountController::class, 'index']);
        Route::get('/{account_id}/campaigns', [\App\Http\Controllers\GoogleAdsAccountController::class, 'getCampaigns']);
        Route::get('/{account_id}/leads', [\App\Http\Controllers\GoogleAdsAccountController::class, 'getLeads']);
        Route::delete('/{account_id}', [\App\Http\Controllers\GoogleAdsAccountController::class, 'disconnect']);
    });

    // Google Integration
    Route::get('/auth/google/redirect', [\App\Http\Controllers\GoogleAuthController::class, 'redirect']);
    Route::get('/auth/google/status', [\App\Http\Controllers\GoogleAuthController::class, 'status']);
    // New route for fetching multiple accounts for the current tenant
    Route::get('/auth/google/accounts', [\App\Http\Controllers\GoogleAdsAccountController::class, 'index']); 
    Route::get('/auth/google/connected-accounts', [\App\Http\Controllers\GoogleAdsAccountController::class, 'connectedAccounts']);
    Route::post('/auth/google/connected-accounts/{connected_account_id}/discover-ads-accounts', [\App\Http\Controllers\GoogleAdsAccountController::class, 'discover']);
    Route::patch('/auth/google/accounts/{account_id}', [\App\Http\Controllers\GoogleAdsAccountController::class, 'update']);
    Route::post('/auth/google/accounts/{account_id}/sync', [\App\Http\Controllers\GoogleAdsAccountController::class, 'sync']);
    Route::post('/auth/google/accounts/{account_id}/generate-webhook-key', [\App\Http\Controllers\GoogleAdsAccountController::class, 'regenerateWebhookKey'])->middleware('impersonation.restrict');
    Route::post('/auth/google/settings', [\App\Http\Controllers\GoogleAuthController::class, 'updateSettings']);
    Route::post('/auth/google/conversion/test', [\App\Http\Controllers\GoogleAuthController::class, 'testConversion']);
    Route::post('/auth/google/conversion/upload', [\App\Http\Controllers\GoogleAuthController::class, 'uploadConversion']);
    Route::post('/auth/google/sync', [\App\Http\Controllers\GoogleAuthController::class, 'sync']);
    Route::post('/auth/google/disconnect', [\App\Http\Controllers\GoogleAuthController::class, 'disconnect']);

    // SMTP Settings
    Route::get('/smtp-settings', [\App\Http\Controllers\SmtpSettingController::class, 'show']);
    Route::put('/smtp-settings', [\App\Http\Controllers\SmtpSettingController::class, 'update']);
    Route::post('/smtp-settings/test', [\App\Http\Controllers\SmtpSettingController::class, 'test']);

    Route::get('users/limit', [UserController::class, 'limitStatus']);


    Route::post('/imports/leads/excel', [ExcelImportController::class , 'importLeads']);
    Route::post('/import', [ExcelImportController::class, 'importLeads']); // Generic alias for /api/import used in frontend

    // Import Jobs (new system - feature-flagged)
    Route::get('/import-jobs', [ImportJobController::class, 'index']);
    Route::post('/import-jobs', [ImportJobController::class, 'store']);
    Route::get('/import-jobs/{id}', [ImportJobController::class, 'show']);
    Route::get('/import-jobs/{id}/rows', [ImportJobController::class, 'rows']);
    Route::get('/import-jobs/{id}/reviewed-file', [ImportJobController::class, 'reviewedFile']);

    Route::get('leads/meetings-report', [LeadController::class , 'meetingsReport']);
    Route::get('leads/stats', [LeadController::class , 'stats']);
    Route::get('leads/analysis', [LeadController::class , 'analysis']);
    Route::get('leads/recycle', [LeadController::class , 'recycleBin']);
    Route::post('leads/recycle/{id}/restore', [LeadController::class , 'restoreFromRecycle']);
    Route::get('leads/pipeline-analysis', [LeadController::class , 'pipelineAnalysis']);
    Route::get('leads/pipeline-report', [LeadController::class , 'pipelineReport']);
    Route::get('leads/reassignment-report', [LeadController::class , 'reassignmentReport']);
Route::get('revenues/summary', [\App\Http\Controllers\RevenueController::class, 'summary']);
Route::get('revenues', [\App\Http\Controllers\RevenueController::class, 'index']);
Route::post('revenues', [\App\Http\Controllers\RevenueController::class, 'store']);
    Route::get('leads/delayed', [LeadController::class , 'delayed']);
    Route::post('leads/bulk-assign-referral', [LeadController::class, 'bulkAssignReferral']);
    Route::post('leads/bulk-remove-referral', [LeadController::class, 'bulkRemoveReferral']);

    Route::get('leads/referral-index', [LeadController::class, 'referralIndex']);
    Route::get('referral-leads', [LeadController::class, 'referralIndex']);
    Route::get('leads/referral-filters', [LeadController::class, 'referralFilters']);
    Route::get('leads/referral-stats', [LeadController::class, 'referralStats']);
    Route::get('referral-supervisors', [LeadController::class, 'getReferralSupervisors']);
    Route::post('leads/{id}/warn-duplicate', [LeadController::class , 'warnDuplicate']);
    Route::post('leads/{id}/resolve-duplicate', [LeadController::class , 'resolveDuplicate']);
    Route::post('leads/duplicates/bulk-action', [LeadController::class , 'bulkDuplicateAction']);
    Route::post('leads/{id}/transfer', [LeadController::class , 'transfer']);
    Route::post('leads/{id}/duplicate-as-fresh', [LeadController::class , 'duplicateAndAssignAsFresh']);
    Route::get('telesales/leads', [TelesalesController::class, 'index']);
    Route::get('telesales/historical', [TelesalesController::class, 'historical']);
    Route::get('telesales/dashboard-summary', [TelesalesController::class, 'dashboardSummary']);
    Route::get('telesales/assignees', [TelesalesController::class, 'assignees']);
    Route::get('telesales/module-disable-check', [TelesalesController::class, 'moduleDisableCheck']);
    Route::post('telesales/leads/bulk-assign', [TelesalesController::class, 'bulkAssign']);
    Route::post('telesales/leads/bulk-transfer-to-sales', [TelesalesController::class, 'bulkTransferToSales']);
    Route::post('telesales/leads/{lead}/transfer-to-sales', [TelesalesController::class, 'transferToSales']);
    Route::post('leads/{id}/attachments', [LeadController::class, 'addAttachments']);
    Route::apiResource('leads', LeadController::class);

    Route::apiResource('quotations', QuotationController::class);

    Route::get('campaigns/dashboard-stats', [\App\Http\Controllers\CampaignController::class , 'dashboardStats']);
    Route::apiResource('campaigns', \App\Http\Controllers\CampaignController::class);
    Route::post('campaigns/{campaign}/record-action', [\App\Http\Controllers\CampaignController::class, 'recordAction']);
    Route::post('campaigns/{campaign}/link-inventory', [\App\Http\Controllers\CampaignController::class, 'linkInventory']);
    Route::apiResource('landing-pages', \App\Http\Controllers\LandingPageController::class);

    Route::apiResource('opportunities', OpportunityController::class);
    Route::get('customers/{id}/attachments', [CustomerController::class, 'attachmentsIndex']);
    Route::post('customers/{id}/attachments', [CustomerController::class, 'attachmentsStore']);
    Route::delete('customers/{id}/attachments/{attachmentId}', [CustomerController::class, 'attachmentsDestroy']);
    Route::get('customers/{id}/comments', [CustomerController::class, 'commentsIndex']);
    Route::post('customers/{id}/comments', [CustomerController::class, 'commentsStore']);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('inventory-requests', InventoryRequestController::class);
    Route::apiResource('sales-orders', OrderController::class);

    Route::get('sales-orders/{order}/attachments', [OrderController::class, 'attachmentsIndex']);
    Route::post('sales-orders/{order}/attachments', [OrderController::class, 'attachmentsStore']);
    Route::delete('sales-orders/{order}/attachments/{attachmentId}', [OrderController::class, 'attachmentsDestroy']);
    Route::get('sales-orders/{order}/advance-summary', [OrderController::class, 'advanceSummary']);
    Route::apiResource('sales-invoices', \App\Http\Controllers\SalesInvoiceController::class);
    Route::get('sales-invoices/{salesInvoice}/payments', [\App\Http\Controllers\SalesInvoiceController::class, 'payments']);
    Route::post('sales-invoices/{salesInvoice}/payments', [\App\Http\Controllers\SalesInvoiceController::class, 'storePayment']);
    Route::apiResource('departments', \App\Http\Controllers\DepartmentController::class);
    Route::apiResource('teams', \App\Http\Controllers\TeamController::class);
    Route::apiResource('tasks', \App\Http\Controllers\TaskController::class);
    Route::get('users/{user}/dependency-summary', [\App\Http\Controllers\UserController::class, 'dependencySummary']);
    Route::post('users/{user}/reassign-dependencies', [\App\Http\Controllers\UserController::class, 'reassignDependencies']);
    Route::apiResource('users', \App\Http\Controllers\UserController::class);
    Route::get('/users/{user}/avatar', [\App\Http\Controllers\UserController::class, 'avatar']); // New Avatar Endpoint
    Route::apiResource('developers', \App\Http\Controllers\DeveloperController::class);
    Route::apiResource('brokers', \App\Http\Controllers\BrokerController::class);
    Route::post('brokers/{broker}/attachments', [\App\Http\Controllers\BrokerController::class, 'attachmentsStore']);
    Route::get('brokers/{broker}/visits', [\App\Http\Controllers\BrokerController::class, 'visits']);
    Route::post('brokers/{broker}/check-in', [\App\Http\Controllers\BrokerController::class, 'checkIn']);
    Route::post('brokers/{broker}/check-out', [\App\Http\Controllers\BrokerController::class, 'checkOut']);
    Route::get('roles', [RoleController::class , 'index']);
    Route::post('stages/reorder', [\App\Http\Controllers\StageController::class, 'reorder']);
    Route::apiResource('stages', \App\Http\Controllers\StageController::class);
    Route::apiResource('agencies', \App\Http\Controllers\AgencyController::class);
    Route::apiResource('sources', \App\Http\Controllers\SourceController::class);
    Route::apiResource('items', ItemController::class);
    Route::apiResource('real-estate-requests', \App\Http\Controllers\RealEstateRequestController::class);
    Route::post('real-estate-requests/{realEstateRequest}/convert-to-deal', [\App\Http\Controllers\RealEstateRequestController::class, 'convertToDeal']);
    Route::apiResource('countries', \App\Http\Controllers\CountryController::class);
    Route::apiResource('cities', \App\Http\Controllers\CityController::class);
    Route::apiResource('regions', \App\Http\Controllers\RegionController::class);
    Route::apiResource('areas', \App\Http\Controllers\AreaController::class);

    // Notification Settings
    Route::get('/notification-settings', [\App\Http\Controllers\NotificationSettingController::class , 'show']);
    Route::put('/notification-settings', [\App\Http\Controllers\NotificationSettingController::class , 'update']);

    // WhatsApp v1 Endpoints
    Route::get('/v1/leads/{lead}/whatsapp-messages', [\App\Http\Controllers\WhatsappMessageController::class , 'leadMessages']);
    Route::get('/v1/whatsapp/capabilities', [\App\Http\Controllers\WhatsappMessageController::class , 'capabilitiesV1']);
    Route::post('/v1/whatsapp/send-template', [\App\Http\Controllers\WhatsappMessageController::class , 'sendTemplateV1']);
    Route::post('/v1/whatsapp/send-text', [\App\Http\Controllers\WhatsappMessageController::class , 'sendTextV1']);
    Route::post('/v1/whatsapp/send-media', [\App\Http\Controllers\WhatsappMessageController::class , 'sendMediaV1']);

    // Notifications (Dynamic)
    Route::get('/notifications', [NotificationController::class , 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class , 'unreadCount']);
    Route::post('/notifications/mark-all-read', [NotificationController::class , 'markAllAsRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class , 'markAsRead']);
    Route::post('/notifications/{id}/archive', [NotificationController::class , 'archive']);
    Route::post('/notifications/{id}/unarchive', [NotificationController::class , 'unarchive']);
    Route::delete('/notifications/{id}', [NotificationController::class , 'destroy']);
    Route::get('/inventory/new-counts', [NotificationController::class , 'inventoryCounts']);
    Route::post('/inventory/mark-seen', [NotificationController::class , 'markInventorySeen']);

    // API Keys
    Route::get('/api-keys', [\App\Http\Controllers\ApiKeyController::class , 'index']);
    Route::post('/api-keys', [\App\Http\Controllers\ApiKeyController::class , 'store'])->middleware('impersonation.restrict');
    Route::delete('/api-keys/{id}', [\App\Http\Controllers\ApiKeyController::class , 'destroy'])->middleware('impersonation.restrict');

    // SMTP Settings
    Route::get('/smtp-settings', [\App\Http\Controllers\SmtpSettingController::class , 'show']);
    Route::put('/smtp-settings', [\App\Http\Controllers\SmtpSettingController::class , 'update']);
    Route::post('/smtp-settings/test', [\App\Http\Controllers\SmtpSettingController::class , 'test']);

    // ERP Settings
    Route::get('/erp-settings', [\App\Http\Controllers\ErpSettingController::class , 'show']);
    Route::put('/erp-settings', [\App\Http\Controllers\ErpSettingController::class , 'update']);
    Route::post('/erp-settings/test', [\App\Http\Controllers\ErpSettingController::class , 'test']);
    Route::post('/erp-sync/run', [\App\Http\Controllers\ErpSyncController::class , 'run']);

    // ERP Sync Logs
    Route::get('/erp-sync-logs', [\App\Http\Controllers\ErpSyncLogController::class , 'index']);

    // SMS Settings
    Route::get('/sms-settings', [\App\Http\Controllers\SmsSettingController::class , 'show']);
    Route::put('/sms-settings', [\App\Http\Controllers\SmsSettingController::class , 'update']);
    Route::post('/sms-settings/test', [\App\Http\Controllers\SmsSettingController::class , 'test']);
    Route::post('/sms-settings/send-test', [\App\Http\Controllers\SmsSettingController::class , 'sendTest']);
    Route::apiResource('sms-templates', \App\Http\Controllers\SmsTemplateController::class);
    // Email Templates
    Route::apiResource('email-templates', \App\Http\Controllers\EmailTemplateController::class);
    // Contract Templates
    Route::post('contract-templates/preview', [\App\Http\Controllers\ContractTemplateController::class, 'preview']);
    Route::apiResource('contract-templates', \App\Http\Controllers\ContractTemplateController::class);

    // WhatsApp Settings
    Route::get('/whatsapp-settings', [\App\Http\Controllers\WhatsappSettingController::class , 'show']);
    Route::put('/whatsapp-settings', [\App\Http\Controllers\WhatsappSettingController::class , 'update']);
    Route::get('/whatsapp-channels', [\App\Http\Controllers\WhatsappChannelController::class, 'index']);
    Route::post('/whatsapp-channels/{channel}/set-primary', [\App\Http\Controllers\WhatsappChannelController::class, 'setPrimary']);
    Route::post('/whatsapp-channels/{mirrorChannel}/start-migration', [\App\Http\Controllers\WhatsappChannelController::class, 'startMigration']);
    Route::post('/whatsapp-channels/{mirrorChannel}/complete-migration', [\App\Http\Controllers\WhatsappChannelController::class, 'completeMigration']);
    Route::post('/whatsapp-channels/{channel}/send-migration-verification', [\App\Http\Controllers\WhatsappChannelController::class, 'sendMigrationVerification']);
    Route::get('/auth/whatsapp/redirect', [\App\Http\Controllers\WhatsappMetaAuthController::class, 'redirect']);
    Route::get('/auth/whatsapp/status', [\App\Http\Controllers\WhatsappMetaAuthController::class, 'status']);
    Route::post('/auth/whatsapp/embedded-signup', [\App\Http\Controllers\WhatsappMetaAuthController::class, 'completeEmbedded']);
    Route::apiResource('whatsapp-templates', \App\Http\Controllers\WhatsappTemplateController::class);
 // Rotation Settings
    Route::get('/rotation-settings', [\App\Http\Controllers\RotationSettingController::class , 'show']);
    Route::put('/rotation-settings', [\App\Http\Controllers\RotationSettingController::class , 'update']);
    Route::get('/rotation-options', [\App\Http\Controllers\RotationOptionsController::class, 'index']);
    Route::get('/rotation-rules', [\App\Http\Controllers\RotationRuleController::class, 'index']);
    Route::post('/rotation-rules', [\App\Http\Controllers\RotationRuleController::class, 'store']);
    Route::post('/rotation-rules/unassign', [\App\Http\Controllers\RotationRuleController::class, 'unassign']);
    Route::put('/rotation-rules/{id}', [\App\Http\Controllers\RotationRuleController::class, 'update']);
    Route::delete('/rotation-rules/{id}', [\App\Http\Controllers\RotationRuleController::class, 'destroy']);


    // CIL Settings
    Route::get('/cil-settings', [\App\Http\Controllers\CilSettingController::class , 'show']);
    Route::put('/cil-settings', [\App\Http\Controllers\CilSettingController::class , 'update']);

    // Reports Routes
    Route::get('/reports/dashboard-stats', [\App\Http\Controllers\ReportsController::class, 'dashboardStats']);
    Route::get('/reports/team-stats', [\App\Http\Controllers\ReportsController::class, 'teamStats']);
    Route::get('/reports/cancellation', [\App\Http\Controllers\ReportsController::class, 'cancellationReport']);
    Route::get('reports/campaigns/dashboard', [\App\Http\Controllers\CampaignReportController::class , 'dashboard']);
    Route::get('reports/campaigns/duration', [\App\Http\Controllers\CampaignReportController::class , 'duration']);
    Route::get('reports/campaigns/summary', [\App\Http\Controllers\CampaignReportController::class , 'summary']);
    Route::get('reports/customers', [CustomerController::class , 'report']);

    Route::get('/company-info', [AuthController::class , 'me']);
    Route::post('/company-info', [AuthController::class , 'updateCompany']);

    Route::get('/profile', [App\Http\Controllers\ProfileController::class , 'show']);

    // Email Messages
    Route::get('/v1/leads/{lead}/email-messages', [\App\Http\Controllers\EmailMessageController::class , 'leadMessages']);
    Route::post('/v1/email/send', [\App\Http\Controllers\EmailMessageController::class , 'send']);
    Route::post('/profile', [App\Http\Controllers\ProfileController::class , 'update'])->middleware('impersonation.restrict');
    Route::post('/profile/theme', [App\Http\Controllers\ProfileController::class , 'updateTheme'])->middleware('impersonation.restrict');
    Route::post('/profile/preferences', [App\Http\Controllers\ProfileController::class , 'preferences']);
    Route::get('/profile/sessions', [App\Http\Controllers\ProfileController::class , 'sessions']);
    Route::delete('/profile/sessions/{id}', [App\Http\Controllers\ProfileController::class , 'revokeSession']);
    Route::get('/user-management/activity-logs', [ActivityLogController::class , 'tenantLogs']);
    Route::get('/user-management/access-logs', [AccessLogController::class , 'index']);
    Route::get('/exports', [\App\Http\Controllers\ExportController::class , 'index']);
    Route::get('/exports/stats', [\App\Http\Controllers\ExportController::class , 'stats']);
    Route::post('/exports', [\App\Http\Controllers\ExportController::class , 'store'])->middleware('impersonation.restrict');
    Route::post('/imports', [\App\Http\Controllers\ExportController::class , 'store']); // Alias for imports logging

    Route::get('/user', function (Request $request) {
            return $request->user();
        }
        );

        // Dashboard Widgets
        Route::get('/dashboard/top-users', [\App\Http\Controllers\DashboardController::class , 'topUsers']);
        Route::get('/dashboard/widgets', function (Request $request) {
            // Ensure user has permission
            if (!$request->user()->can('view-reports')) { // Example permission
            // Return basic stats if no permission? Or 403.
            // For now, let's allow basic access or check a general permission
            }

            $leadCount = \App\Models\Lead::count();
            $recentLeads = \App\Models\Lead::latest()->take(5)->get();

            // Tenant is bound by InitializeTenancy middleware for auth users
            return response()->json([
            'tenant' => app('tenant')->name ?? 'Unknown Tenant',
            'stats' => [
            'total_leads' => $leadCount,
            ],
            'recent_leads' => $recentLeads
            ]);
        }
        );

        // Analytics: Top Agents by actions on their own leads
        Route::get('/dashboard-data/top-agents', [ActivityLogController::class , 'topAgents']);
        Route::get('/dashboard-data/last-comments', [ActivityLogController::class , 'lastComments']);
        Route::get('/dashboard-data/recent-phone-calls', [ActivityLogController::class , 'recentPhoneCalls']);
        Route::get('/dashboard-data/active-users', [ActivityLogController::class , 'activeUsers']);

        // Dynamic Fields Routes
        Route::prefix('admin')->group(function () {
            Route::get('fields', [FieldController::class , 'index']);
            Route::post('fields', [FieldController::class , 'store']);
            Route::put('fields/{id}', [FieldController::class , 'update']);
            Route::delete('fields/{id}', [FieldController::class , 'destroy']);
            Route::patch('fields/{id}/toggle-active', [FieldController::class , 'toggleActive']);
            Route::post('fields/reorder', [FieldController::class , 'reorder']);
        }
        );

        // Entity Routes (Tenant Isolated via Global Scope)
        // Leads Recycle Bin & Bulk Operations
        Route::get('leads/trashed', [LeadController::class , 'trashed']);
        Route::post('leads/{id}/restore', [LeadController::class , 'restore']);
        Route::delete('leads/{id}/force', [LeadController::class , 'forceDelete']);
        Route::post('leads/bulk-restore', [LeadController::class , 'bulkRestore']);
        Route::post('leads/bulk-force-delete', [LeadController::class , 'bulkForceDelete']);
        Route::post('leads/bulk-delete', [LeadController::class , 'bulkDelete']);

        Route::post('leads/bulk-import', [LeadController::class , 'bulkImport']);
        Route::post('leads/bulk-assign', [LeadController::class , 'bulkAssign']);
        Route::post('leads/bulk-status', [LeadController::class , 'bulkStatus']);

        Route::get('lead-actions/activity-report', [\App\Http\Controllers\LeadActionController::class, 'activityReport']);
        Route::apiResource('lead-actions', \App\Http\Controllers\LeadActionController::class);
        Route::apiResource('visits', \App\Http\Controllers\VisitController::class);
        Route::apiResource('units', \App\Http\Controllers\UnitController::class);
        Route::get('projects/stats', [\App\Http\Controllers\ProjectController::class, 'stats']);
        Route::apiResource('projects', \App\Http\Controllers\ProjectController::class);
        Route::apiResource('properties', PropertyController::class);
        Route::apiResource('item-categories', \App\Http\Controllers\ItemCategoryController::class);
        Route::get('cancel-reasons/{cancelReason}/usage', [\App\Http\Controllers\CancelReasonController::class, 'usage']);
        Route::post('cancel-reasons/{cancelReason}/replace-and-delete', [\App\Http\Controllers\CancelReasonController::class, 'replaceAndDelete']);
        Route::apiResource('cancel-reasons', \App\Http\Controllers\CancelReasonController::class);
    });
