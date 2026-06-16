<?php

namespace App\Http\Controllers;

use App\Models\Agency;
use App\Models\User;
use App\Support\AppliesAgencyScope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AgencyController extends Controller
{
    use AppliesAgencyScope;

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Agency::query();

        if ($this->isAgencyScopedMarketingUser($user)) {
            $query->where('key', $this->currentAgencyId($user));
        }

        if ($request->boolean('active')) {
            $query->where('is_active', true);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('key', 'like', "%{$search}%");
            });
        }

        $agencies = $query->orderBy('name')->get();

        return response()->json($agencies->map(function (Agency $agency) {
            $agency->setAttribute('linked_users_count', $this->linkedUsersCount($agency));
            return $agency;
        }));
    }

    public function store(Request $request)
    {
        $this->ensureAgencyAdminAccess($request->user());

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('agencies', 'name')->where(fn ($query) => $query->where('tenant_id', $this->tenantId())),
            ],
            'key' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('agencies', 'key')->where(fn ($query) => $query->where('tenant_id', $this->tenantId())),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $agency = Agency::create([
            'name' => trim($validated['name']),
            'key' => $this->buildUniqueKey(trim((string) ($validated['key'] ?? '')), trim($validated['name'])),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ]);

        $agency->setAttribute('linked_users_count', 0);

        return response()->json($agency, 201);
    }

    public function show(Agency $agency)
    {
        $this->ensureAgencyVisibility($agency, request()->user());
        $agency->setAttribute('linked_users_count', $this->linkedUsersCount($agency));

        return response()->json($agency);
    }

    public function update(Request $request, Agency $agency)
    {
        $this->ensureAgencyAdminAccess($request->user());

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('agencies', 'name')
                    ->where(fn ($query) => $query->where('tenant_id', $agency->tenant_id))
                    ->ignore($agency->id),
            ],
            'key' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('agencies', 'key')
                    ->where(fn ($query) => $query->where('tenant_id', $agency->tenant_id))
                    ->ignore($agency->id),
            ],
            'is_active' => 'sometimes|boolean',
        ]);

        $updates = [];

        if (array_key_exists('name', $validated)) {
            $updates['name'] = trim($validated['name']);
        }

        if (array_key_exists('key', $validated)) {
            $desiredKey = trim((string) ($validated['key'] ?? ''));
            if ($desiredKey !== '' && $desiredKey !== $agency->key) {
                return response()->json([
                    'message' => 'Agency key cannot be changed after creation because existing data may already reference it.',
                ], 422);
            }
        }

        if (array_key_exists('is_active', $validated)) {
            $updates['is_active'] = (bool) $validated['is_active'];
        }

        $agency->update($updates);
        $agency->setAttribute('linked_users_count', $this->linkedUsersCount($agency));

        return response()->json($agency);
    }

    public function destroy(Agency $agency)
    {
        $this->ensureAgencyAdminAccess(request()->user());

        if ($this->linkedUsersCount($agency) > 0) {
            return response()->json([
                'message' => 'This agency has linked users. Disable it instead of deleting it.',
            ], 422);
        }

        $agency->delete();

        return response()->noContent();
    }

    protected function tenantId(): ?int
    {
        if (app()->bound('current_tenant_id')) {
            return (int) app('current_tenant_id');
        }

        if (app()->bound('tenant')) {
            return (int) app('tenant')->id;
        }

        return request()->user()?->tenant_id ? (int) request()->user()->tenant_id : null;
    }

    protected function buildUniqueKey(string $providedKey, string $name, ?int $ignoreAgencyId = null): string
    {
        $base = Str::slug($providedKey !== '' ? $providedKey : $name);
        $base = $base !== '' ? $base : 'agency';
        $key = $base;
        $suffix = 1;

        while (
            Agency::query()
                ->where('key', $key)
                ->when($ignoreAgencyId, fn ($query) => $query->where('id', '!=', $ignoreAgencyId))
                ->exists()
        ) {
            $suffix++;
            $key = "{$base}-{$suffix}";
        }

        return $key;
    }

    protected function linkedUsersCount(Agency $agency): int
    {
        return DB::table('users')
            ->where('tenant_id', $agency->tenant_id)
            ->where('agency_id', $agency->key)
            ->count();
    }

    protected function ensureAgencyVisibility(Agency $agency, ?User $user): void
    {
        if ($this->isAgencyScopedMarketingUser($user) && $agency->key !== $this->currentAgencyId($user)) {
            abort(404);
        }
    }

    protected function ensureAgencyAdminAccess(?User $user): void
    {
        $roleLower = strtolower(trim((string) ($user?->role ?? $user?->job_title ?? '')));
        $allowed = ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'operations manager'];

        if (($user?->is_super_admin ?? false) || in_array($roleLower, $allowed, true)) {
            return;
        }

        abort(403, 'Only admins can manage agencies.');
    }
}
