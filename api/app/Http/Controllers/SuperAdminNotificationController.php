<?php

namespace App\Http\Controllers;

use App\Models\AdminNotification;
use App\Models\AdminNotificationSetting;
use App\Models\AdminPushSubscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SuperAdminNotificationController extends Controller
{
    public function index(Request $request)
    {
        if (! config('features.admin_notifications_v1')) {
            return response()->json([
                'notifications' => ['data' => []],
                'unread_count' => 0,
                'feature_enabled' => false,
            ]);
        }

        $user = $request->user();
        $query = AdminNotification::query()->where('admin_user_id', $user->id);

        if ($request->filled('status')) {
            $status = $request->string('status')->toString();
            if ($status === 'unread') {
                $query->whereNull('read_at')->whereNull('archived_at');
            } elseif ($status === 'read') {
                $query->whereNotNull('read_at')->whereNull('archived_at');
            } elseif ($status === 'archived') {
                $query->whereNotNull('archived_at');
            }
        }

        foreach (['severity', 'category', 'source'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->string($filter)->toString());
            }
        }

        if ($request->filled('related_tenant_id')) {
            $query->where('related_tenant_id', (int) $request->input('related_tenant_id'));
        }

        $notifications = $query->latest()->paginate(20);
        $unreadCount = AdminNotification::query()
            ->where('admin_user_id', $user->id)
            ->whereNull('read_at')
            ->whereNull('archived_at')
            ->count();

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => $unreadCount,
            'feature_enabled' => true,
        ]);
    }

    public function unreadCount(Request $request)
    {
        if (! config('features.admin_notifications_v1')) {
            return response()->json(['count' => 0, 'feature_enabled' => false]);
        }

        $count = AdminNotification::query()
            ->where('admin_user_id', $request->user()->id)
            ->whereNull('read_at')
            ->whereNull('archived_at')
            ->count();

        return response()->json(['count' => $count, 'feature_enabled' => true]);
    }

    public function markAsRead(Request $request, AdminNotification $notification)
    {
        $this->authorizeNotification($request, $notification);

        if (is_null($notification->read_at)) {
            $notification->update(['read_at' => now()]);
        }

        return response()->noContent();
    }

    public function markAllAsRead(Request $request)
    {
        AdminNotification::query()
            ->where('admin_user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->noContent();
    }

    public function archive(Request $request, AdminNotification $notification)
    {
        $this->authorizeNotification($request, $notification);

        $notification->update([
            'read_at' => $notification->read_at ?? now(),
            'archived_at' => now(),
        ]);

        return response()->noContent();
    }

    public function archiveAllRead(Request $request)
    {
        AdminNotification::query()
            ->where('admin_user_id', $request->user()->id)
            ->whereNotNull('read_at')
            ->whereNull('archived_at')
            ->update(['archived_at' => now()]);

        return response()->noContent();
    }

    public function settingsShow()
    {
        $user = Auth::user();
        $settings = AdminNotificationSetting::firstOrCreate(
            ['admin_user_id' => $user->id],
            ['in_app_enabled' => true, 'email_enabled' => false, 'push_enabled' => false]
        );

        return response()->json($settings);
    }

    public function settingsUpdate(Request $request)
    {
        $settings = AdminNotificationSetting::firstOrCreate(['admin_user_id' => $request->user()->id]);

        $validated = $request->validate([
            'in_app_enabled' => 'boolean',
            'email_enabled' => 'boolean',
            'push_enabled' => 'boolean',
            'quiet_hours_enabled' => 'boolean',
            'quiet_hours_start' => 'nullable|date_format:H:i',
            'quiet_hours_end' => 'nullable|date_format:H:i',
            'category_preferences' => 'nullable|array',
            'severity_preferences' => 'nullable|array',
            'meta_data' => 'nullable|array',
        ]);

        $settings->update($validated);

        return response()->json($settings);
    }

    public function subscribePush(Request $request)
    {
        $validated = $request->validate([
            'endpoint' => 'required|string',
            'keys.auth' => 'required|string',
            'keys.p256dh' => 'required|string',
        ]);

        $endpointHash = hash('sha256', $validated['endpoint']);

        $subscription = AdminPushSubscription::query()->updateOrCreate(
            ['admin_user_id' => $request->user()->id, 'endpoint_hash' => $endpointHash],
            [
                'endpoint' => $validated['endpoint'],
                'endpoint_hash' => $endpointHash,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'user_agent' => Str::limit((string) $request->userAgent(), 65535, ''),
                'revoked_at' => null,
                'last_used_at' => now(),
            ]
        );

        return response()->json(['success' => true, 'id' => $subscription->id]);
    }

    public function unsubscribePush(Request $request)
    {
        $validated = $request->validate([
            'endpoint' => 'nullable|string',
        ]);

        $query = AdminPushSubscription::query()
            ->where('admin_user_id', $request->user()->id)
            ->whereNull('revoked_at');

        if (! empty($validated['endpoint'])) {
            $query->where('endpoint_hash', hash('sha256', $validated['endpoint']));
        }

        $query->update(['revoked_at' => now()]);

        return response()->json(['success' => true]);
    }

    protected function authorizeNotification(Request $request, AdminNotification $notification): void
    {
        abort_unless($notification->admin_user_id === $request->user()->id, 404);
    }
}

