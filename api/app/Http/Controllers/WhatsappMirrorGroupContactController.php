<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Source;
use App\Models\User;
use App\Models\WhatsappGroupContact;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappMirrorClient;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class WhatsappMirrorGroupContactController extends Controller
{
    private function inferPhoneCountryCode(string $phone, ?string $fallback = null): ?string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if ($digits === '') {
            return $fallback ?: null;
        }

        if (str_starts_with($digits, '20') || str_starts_with($digits, '01') || (strlen($digits) === 10 && str_starts_with($digits, '1'))) {
            return '+20';
        }

        if (str_starts_with($digits, '966') || str_starts_with($digits, '05') || (strlen($digits) === 9 && str_starts_with($digits, '5'))) {
            return '+966';
        }

        if (str_starts_with($digits, '971')) {
            return '+971';
        }

        return $fallback ?: null;
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $status = strtolower(trim((string) $request->query('status', 'pending')));
        $search = trim((string) $request->query('search', ''));
        $perPage = max(1, min(100, (int) $request->query('per_page', 20)));

        $query = WhatsappGroupContact::query()
            ->where('tenant_id', $user->tenant_id)
            ->with('convertedLead:id,name,phone');

        if (in_array($status, ['pending', 'converted'], true)) {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($subQuery) use ($search) {
                $subQuery->where('phone', 'like', "%{$search}%")
                    ->orWhere('push_name', 'like', "%{$search}%")
                    ->orWhere('group_name', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderByDesc('last_synced_at')->orderBy('group_name')->paginate($perPage)
        );
    }

    public function sync(
        Request $request,
        WhatsappMirrorClient $client,
        WhatsappGroupContactService $groupContactService
    ) {
        $tenantId = (int) $request->user()->tenant_id;
        $response = $client->fetchGroupContacts($tenantId);

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Failed to sync group contacts from WhatsApp Mirror.',
                'details' => $response->json(),
            ], $response->status() ?: 500);
        }

        $payload = $response->json();
        $contacts = array_values(array_filter((array) ($payload['contacts'] ?? []), fn ($contact) => is_array($contact)));
        $summary = $groupContactService->syncContacts($tenantId, $contacts);

        return response()->json([
            'ok' => true,
            'summary' => [
                ...$summary,
                'received' => count($contacts),
                'groups' => (int) ($payload['groups_count'] ?? 0),
            ],
        ]);
    }

    public function convertToLead(
        Request $request,
        WhatsappGroupContact $contact,
        WhatsappGroupContactService $groupContactService,
        WhatsappUnassignedContactService $unassignedContactService
    ) {
        $user = $request->user();
        abort_unless((int) $contact->tenant_id === (int) $user->tenant_id, 404);

        if ($contact->status === 'converted' && $contact->converted_lead_id) {
            $existingLead = Lead::query()
                ->where('tenant_id', $user->tenant_id)
                ->find($contact->converted_lead_id);

            return response()->json([
                'ok' => true,
                'lead' => $existingLead,
                'contact' => $contact->load('convertedLead:id,name,phone'),
            ]);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'company' => 'nullable|string|max:255',
            'campaign' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'stage' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:255',
            'priority' => 'nullable|string|max:255',
            'estimated_value' => 'nullable|numeric',
            'project_id' => 'nullable|integer',
            'item_id' => 'nullable|integer',
            'assigned_to' => 'nullable|integer',
            'phone_country' => 'nullable|string|max:10',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($request->filled('project_id')) {
            $projectExists = Project::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('id', (int) $request->input('project_id'))
                ->exists();

            if (!$projectExists) {
                return response()->json(['errors' => ['project_id' => ['Selected project does not exist for this tenant.']]], 422);
            }
        }

        if ($request->filled('item_id')) {
            $itemExists = Item::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('id', (int) $request->input('item_id'))
                ->exists();

            if (!$itemExists) {
                return response()->json(['errors' => ['item_id' => ['Selected item does not exist for this tenant.']]], 422);
            }
        }

        if ($request->filled('assigned_to')) {
            $assigneeExists = User::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('id', (int) $request->input('assigned_to'))
                ->exists();

            if (!$assigneeExists) {
                return response()->json(['errors' => ['assigned_to' => ['Selected assignee does not exist for this tenant.']]], 422);
            }
        }

        $requestedPhoneCountry = trim((string) $request->input('phone_country', ''));
        $effectivePhoneCountry = $this->inferPhoneCountryCode((string) $contact->phone, $requestedPhoneCountry !== '' ? $requestedPhoneCountry : null) ?? '';
        $normalizedPhone = PhoneNormalizer::normalize((string) $contact->phone, $effectivePhoneCountry !== '' ? $effectivePhoneCountry : null);
        if ($normalizedPhone === '') {
            $normalizedPhone = PhoneNormalizer::normalize((string) $contact->phone, null);
        }

        $leadPayload = array_filter([
            'source' => Source::withoutGlobalScopes()->firstOrCreate(
                [
                    'tenant_id' => $user->tenant_id,
                    'name' => 'WhatsApp Mirror',
                ],
                [
                    'is_active' => true,
                ]
            )->name,
            'name' => trim((string) $request->input('name')),
            'phone' => $normalizedPhone !== '' ? $normalizedPhone : trim((string) $contact->phone),
            'email' => trim((string) $request->input('email', '')),
            'company' => trim((string) $request->input('company', '')),
            'campaign' => trim((string) $request->input('campaign', '')),
            'country' => trim((string) $request->input('country', '')),
            'notes' => trim((string) $request->input('notes', '')),
            'stage' => trim((string) $request->input('stage', 'New Lead')),
            'status' => trim((string) $request->input('status', 'new')),
            'priority' => trim((string) $request->input('priority', 'medium')),
            'estimated_value' => $request->filled('estimated_value') ? $request->input('estimated_value') : null,
            'project_id' => $request->filled('project_id') ? (int) $request->input('project_id') : null,
            'item_id' => $request->filled('item_id') ? (int) $request->input('item_id') : null,
            'assigned_to' => $request->filled('assigned_to') ? (int) $request->input('assigned_to') : null,
            'phone_country' => $effectivePhoneCountry,
        ], fn ($value) => !($value === null || $value === ''));

        $leadRequest = Request::create('/api/leads', 'POST', $leadPayload);
        $leadRequest->setUserResolver(fn () => $user);
        $leadRequest->headers->replace($request->headers->all());
        $leadRequest->server->set('HTTP_ACCEPT', 'application/json');

        $response = app(LeadController::class)->store($leadRequest);
        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        $decoded = json_decode($response->getContent(), true);
        $leadId = (int) ($decoded['id'] ?? data_get($decoded, 'data.id') ?? 0);
        $lead = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->findOrFail($leadId);

        if (!filled($lead->phone) && $normalizedPhone !== '') {
            $lead->forceFill(['phone' => $normalizedPhone])->save();
            $lead->refresh();
        }

        DB::transaction(function () use ($contact, $lead, $user, $groupContactService, $unassignedContactService) {
            $groupContactService->markPhoneAsConverted((int) $user->tenant_id, (string) $contact->phone, (int) $lead->id);
            $unassignedContactService->attachLeadToMatchingMessages((int) $user->tenant_id, $lead);
        });

        return response()->json([
            'ok' => true,
            'lead' => $lead->load(['creator:id,name', 'assignedAgent:id,name']),
            'contact' => $contact->fresh('convertedLead:id,name,phone'),
        ]);
    }
}
