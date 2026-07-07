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
    private function isSuccessfulGroupAddResult(array $result): bool
    {
        $status = $result['status'] ?? null;

        if (is_int($status)) {
            return $status >= 200 && $status < 300;
        }

        if (is_string($status) && is_numeric($status)) {
            $numericStatus = (int) $status;
            return $numericStatus >= 200 && $numericStatus < 300;
        }

        return !array_key_exists('status', $result);
    }

    private function buildGroupAddFailureMessage(array $result): string
    {
        $status = $result['status'] ?? null;
        $inviteCode = trim((string) ($result['invite_code'] ?? ''));
        $rawMessage = strtolower(trim((string) ($result['message'] ?? $result['error'] ?? '')));

        if ($inviteCode !== '') {
            return 'WhatsApp requires an invite link for this participant instead of direct add.';
        }

        return match ((string) $status) {
            '403' => str_contains($rawMessage, 'admin')
                ? 'WhatsApp rejected the add request because only group admins can add members directly.'
                : 'WhatsApp rejected the add request. The group may restrict who can add members, or this account is not allowed to add this participant directly.',
            '404' => 'WhatsApp could not find this participant on WhatsApp with a direct-add compatible number.',
            '408' => 'WhatsApp timed out while adding the participant. Try reconnecting the mirror and retry.',
            '409' => 'WhatsApp reported a session conflict while adding the participant. Reconnect the mirror and try again.',
            '500' => 'WhatsApp failed to add the participant due to an upstream server error.',
            default => 'WhatsApp rejected the participant add request.',
        };
    }

    private function mapGroupAddFailureReason(array $result): string
    {
        $status = (string) ($result['status'] ?? '');
        $inviteCode = trim((string) ($result['invite_code'] ?? ''));
        $rawMessage = strtolower(trim((string) ($result['message'] ?? $result['error'] ?? '')));

        if ($inviteCode !== '') {
            return 'privacy_restricted';
        }

        return match ($status) {
            '403' => str_contains($rawMessage, 'admin') ? 'group_admin_only' : 'privacy_restricted',
            '404' => 'invalid_whatsapp_number',
            '408', '409', '429' => 'rate_limited',
            '500', '502', '503', '504' => 'unknown_error',
            default => 'unknown_error',
        };
    }

    private function buildFriendlyAddFailureHint(?string $reason): string
    {
        return match ((string) $reason) {
            'privacy_restricted', 'group_admin_only' => 'لم يتم إضافة الرقم للجروب. السبب المحتمل: إعدادات الخصوصية أو صلاحيات الجروب تمنع الإضافة المباشرة. يمكنك إرسال رابط الدعوة بدلًا من الإضافة المباشرة.',
            'invalid_whatsapp_number' => 'لم يتم إضافة الرقم للجروب. السبب المحتمل: الرقم غير صالح على واتساب أو لا يدعم الإضافة المباشرة. يمكنك مراجعة الرقم أو إرسال رابط الدعوة.',
            'rate_limited' => 'لم يتم إضافة الرقم الآن بسبب قيود مؤقتة من واتساب. يمكنك المحاولة مرة أخرى أو إرسال رابط الدعوة بدلًا من ذلك.',
            default => 'لم يتم إضافة الرقم للجروب. يمكنك المحاولة مرة أخرى أو إرسال رابط الدعوة بدلًا من الإضافة المباشرة.',
        };
    }

    private function updateGroupActionState(WhatsappGroupContact $contact, array $attributes): WhatsappGroupContact
    {
        $contact->forceFill($attributes);
        $contact->save();

        return $contact->fresh('convertedLead:id,name,phone');
    }

    private function looksLikeLid(?string $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) ($value ?? '')) ?: '';
        return $digits !== '' && strlen($digits) >= 14;
    }

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
        $groupId = trim((string) $request->query('group_id', ''));
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
                    ->orWhere('resolved_phone', 'like', "%{$search}%")
                    ->orWhere('lid', 'like', "%{$search}%")
                    ->orWhere('push_name', 'like', "%{$search}%")
                    ->orWhere('group_name', 'like', "%{$search}%");
            });
        }

        if ($groupId !== '') {
            $query->where(function ($subQuery) use ($groupId) {
                $subQuery->where('group_jid', $groupId)
                    ->orWhere('group_name', $groupId);
            });
        }

        return response()->json(
            $query->orderByDesc('last_synced_at')->orderBy('group_name')->paginate($perPage)
        );
    }

    public function storedGroups(Request $request)
    {
        $user = $request->user();
        $status = strtolower(trim((string) $request->query('status', 'pending')));

        $query = WhatsappGroupContact::query()
            ->where('tenant_id', $user->tenant_id)
            ->select('group_jid', 'group_name');

        if (in_array($status, ['pending', 'converted'], true)) {
            $query->where('status', $status);
        }

        $groups = $query
            ->where(function ($subQuery) {
                $subQuery->whereNotNull('group_jid')
                    ->orWhereNotNull('group_name');
            })
            ->distinct()
            ->orderBy('group_name')
            ->get()
            ->map(function (WhatsappGroupContact $contact) {
                $groupName = trim((string) ($contact->group_name ?? ''));
                $groupId = trim((string) ($contact->group_jid ?: $groupName));

                return [
                    'id' => $groupId,
                    'name' => $groupName !== '' ? $groupName : 'Unnamed group',
                    'group_jid' => $contact->group_jid,
                ];
            })
            ->filter(fn (array $group) => $group['id'] !== '')
            ->values();

        return response()->json($groups);
    }

    public function groups(Request $request, WhatsappMirrorClient $client)
    {
        $tenantId = (int) $request->user()->tenant_id;
        $response = $client->listGroups($tenantId);

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Failed to fetch groups from WhatsApp Mirror.',
                'details' => $response->json(),
            ], $response->status() ?: 500);
        }

        return response()->json($response->json());
    }

    public function destroy(Request $request, WhatsappGroupContact $contact)
    {
        $user = $request->user();
        abort_unless((int) $contact->tenant_id === (int) $user->tenant_id, 404);

        $contact->delete();

        return response()->json(['ok' => true]);
    }

    public function sync(
        Request $request,
        WhatsappMirrorClient $client,
        WhatsappGroupContactService $groupContactService
    ) {
        $tenantId = (int) $request->user()->tenant_id;
        $groupIds = array_values(array_filter((array) $request->input('group_ids', [])));
        $response = $client->fetchGroupContacts($tenantId, $groupIds);

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Failed to sync group contacts from WhatsApp Mirror.',
                'details' => $response->json(),
            ], $response->status() ?: 500);
        }

        $payload = $response->json();
        $contacts = array_values(array_filter((array) ($payload['contacts'] ?? []), fn ($contact) => is_array($contact)));
        $summary = $groupContactService->syncContacts($tenantId, $contacts);
        $resolvedNow = 0;

        $unresolvedLids = array_values(array_unique(array_filter((array) ($summary['unresolved_lids'] ?? []))));
        if (!empty($unresolvedLids)) {
            $resolveResponse = $client->resolveLids($tenantId, $unresolvedLids);
            if ($resolveResponse->successful()) {
                $resolvedNow = $groupContactService->applyResolvedLidMap(
                    $tenantId,
                    (array) ($resolveResponse->json('resolved') ?? [])
                );
            }
        }

        return response()->json([
            'ok' => true,
            'summary' => [
                ...$summary,
                'received' => count($contacts),
                'groups' => (int) ($payload['groups_count'] ?? 0),
                'resolved_now' => $resolvedNow,
                'unresolved_remaining' => max(0, count($unresolvedLids) - $resolvedNow),
            ],
        ]);
    }

    public function adminGroups(Request $request, WhatsappMirrorClient $client)
    {
        $tenantId = (int) $request->user()->tenant_id;
        $response = $client->adminGroups($tenantId);

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Failed to fetch admin groups from WhatsApp Mirror.',
                'details' => $response->json(),
            ], $response->status() ?: 500);
        }

        return response()->json($response->json('groups') ?? []);
    }

    public function addToGroup(Request $request, WhatsappGroupContact $contact, WhatsappMirrorClient $client)
    {
        $user = $request->user();
        abort_unless((int) $contact->tenant_id === (int) $user->tenant_id, 404);

        $validator = Validator::make($request->all(), [
            'group_id' => 'required|string',
            'group_name' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $targetGroupId = (string) $request->input('group_id');
        $targetGroupName = trim((string) $request->input('group_name', '')) ?: null;

        $phone = trim((string) ($contact->resolved_phone ?: $contact->phone));
        if ($phone === '' || $this->looksLikeLid($phone)) {
            $updatedContact = $this->updateGroupActionState($contact, [
                'group_action_status' => 'add_failed',
                'group_action_reason' => 'invalid_whatsapp_number',
                'group_action_message' => $this->buildFriendlyAddFailureHint('invalid_whatsapp_number'),
                'last_target_group_jid' => $targetGroupId,
                'last_target_group_name' => $targetGroupName,
                'last_add_attempt_at' => now(),
            ]);

            return response()->json([
                'message' => 'This contact has no resolvable phone number yet.',
                'contact' => $updatedContact,
            ], 422);
        }

        $tenantId = (int) $user->tenant_id;
        $response = $client->addParticipantToGroup($tenantId, $targetGroupId, $phone);

        if (!$response->successful()) {
            $updatedContact = $this->updateGroupActionState($contact, [
                'group_action_status' => 'add_failed',
                'group_action_reason' => 'unknown_error',
                'group_action_message' => $this->buildFriendlyAddFailureHint('unknown_error'),
                'last_target_group_jid' => $targetGroupId,
                'last_target_group_name' => $targetGroupName,
                'last_add_attempt_at' => now(),
            ]);

            return response()->json([
                'message' => 'Failed to add contact to group.',
                'details' => $response->json(),
                'contact' => $updatedContact,
            ], $response->status() ?: 500);
        }

        $result = (array) ($response->json('result') ?? []);
        if (!empty($result) && !$this->isSuccessfulGroupAddResult($result)) {
            $reason = $this->mapGroupAddFailureReason($result);
            $updatedContact = $this->updateGroupActionState($contact, [
                'group_action_status' => 'add_failed',
                'group_action_reason' => $reason,
                'group_action_message' => $this->buildFriendlyAddFailureHint($reason),
                'last_target_group_jid' => $targetGroupId,
                'last_target_group_name' => $targetGroupName,
                'last_add_attempt_at' => now(),
                'invite_link' => !empty($result['invite_code'])
                    ? ('https://chat.whatsapp.com/' . trim((string) $result['invite_code']))
                    : $contact->invite_link,
            ]);

            return response()->json([
                'message' => $this->buildGroupAddFailureMessage($result),
                'details' => $result,
                'friendly_message' => $this->buildFriendlyAddFailureHint($reason),
                'contact' => $updatedContact,
            ], 422);
        }

        $updatedContact = $this->updateGroupActionState($contact, [
            'group_action_status' => 'added',
            'group_action_reason' => null,
            'group_action_message' => null,
            'last_target_group_jid' => $targetGroupId,
            'last_target_group_name' => $targetGroupName,
            'last_add_attempt_at' => now(),
        ]);

        return response()->json([
            ...$response->json(),
            'contact' => $updatedContact,
        ]);
    }

    public function bulkAddToGroup(Request $request, WhatsappMirrorClient $client)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'group_id' => 'required|string',
            'contact_ids' => 'required|array|min:1',
            'contact_ids.*' => 'integer',
            'group_name' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $contacts = WhatsappGroupContact::query()
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('id', (array) $request->input('contact_ids', []))
            ->get();

        if ($contacts->isEmpty()) {
            return response()->json([
                'message' => 'No valid contacts were selected.',
            ], 422);
        }

        $tenantId = (int) $user->tenant_id;
        $groupId = (string) $request->input('group_id');
        $groupName = trim((string) $request->input('group_name', '')) ?: null;
        $results = [];

        foreach ($contacts as $contact) {
            $phone = trim((string) ($contact->resolved_phone ?: $contact->phone));
            if ($phone === '' || $this->looksLikeLid($phone)) {
                $this->updateGroupActionState($contact, [
                    'group_action_status' => 'add_failed',
                    'group_action_reason' => 'invalid_whatsapp_number',
                    'group_action_message' => $this->buildFriendlyAddFailureHint('invalid_whatsapp_number'),
                    'last_target_group_jid' => $groupId,
                    'last_target_group_name' => $groupName,
                    'last_add_attempt_at' => now(),
                ]);
                $results[] = [
                    'contact_id' => (int) $contact->id,
                    'phone' => $phone,
                    'ok' => false,
                    'message' => 'This contact has no resolvable phone number yet.',
                ];
                continue;
            }

            $response = $client->addParticipantToGroup($tenantId, $groupId, $phone);
            if (!$response->successful()) {
                $this->updateGroupActionState($contact, [
                    'group_action_status' => 'add_failed',
                    'group_action_reason' => 'unknown_error',
                    'group_action_message' => $this->buildFriendlyAddFailureHint('unknown_error'),
                    'last_target_group_jid' => $groupId,
                    'last_target_group_name' => $groupName,
                    'last_add_attempt_at' => now(),
                ]);
                $results[] = [
                    'contact_id' => (int) $contact->id,
                    'phone' => $phone,
                    'ok' => false,
                    'message' => 'Failed to add contact to group.',
                    'details' => $response->json(),
                ];
                continue;
            }

            $result = (array) ($response->json('result') ?? []);
            if (!empty($result) && !$this->isSuccessfulGroupAddResult($result)) {
                $reason = $this->mapGroupAddFailureReason($result);
                $this->updateGroupActionState($contact, [
                    'group_action_status' => 'add_failed',
                    'group_action_reason' => $reason,
                    'group_action_message' => $this->buildFriendlyAddFailureHint($reason),
                    'last_target_group_jid' => $groupId,
                    'last_target_group_name' => $groupName,
                    'last_add_attempt_at' => now(),
                    'invite_link' => !empty($result['invite_code'])
                        ? ('https://chat.whatsapp.com/' . trim((string) $result['invite_code']))
                        : $contact->invite_link,
                ]);
                $results[] = [
                    'contact_id' => (int) $contact->id,
                    'phone' => $phone,
                    'ok' => false,
                    'message' => $this->buildGroupAddFailureMessage($result),
                    'details' => $result,
                ];
                continue;
            }

            $this->updateGroupActionState($contact, [
                'group_action_status' => 'added',
                'group_action_reason' => null,
                'group_action_message' => null,
                'last_target_group_jid' => $groupId,
                'last_target_group_name' => $groupName,
                'last_add_attempt_at' => now(),
            ]);

            $results[] = [
                'contact_id' => (int) $contact->id,
                'phone' => $phone,
                'ok' => true,
                'details' => $result,
            ];
        }

        $successes = collect($results)->where('ok', true)->count();
        $failures = count($results) - $successes;

        return response()->json([
            'ok' => $failures === 0,
            'summary' => [
                'requested' => count($results),
                'added' => $successes,
                'failed' => $failures,
            ],
            'results' => $results,
        ], $failures > 0 ? 207 : 200);
    }

    public function sendInviteToGroup(Request $request, WhatsappGroupContact $contact, WhatsappMirrorClient $client)
    {
        $user = $request->user();
        abort_unless((int) $contact->tenant_id === (int) $user->tenant_id, 404);

        $validator = Validator::make($request->all(), [
            'group_id' => 'required|string',
            'group_name' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $targetGroupId = (string) $request->input('group_id');
        $targetGroupName = trim((string) $request->input('group_name', '')) ?: null;
        $phone = trim((string) ($contact->resolved_phone ?: $contact->phone));

        if ($phone === '' || $this->looksLikeLid($phone)) {
            return response()->json([
                'message' => 'This contact has no resolvable phone number yet.',
            ], 422);
        }

        $response = $client->sendGroupInvite((int) $user->tenant_id, $targetGroupId, $phone, $targetGroupName);

        if (!$response->successful()) {
            return response()->json([
                'message' => 'Failed to send invite link.',
                'details' => $response->json(),
            ], $response->status() ?: 500);
        }

        $result = (array) ($response->json('result') ?? []);
        $updatedContact = $this->updateGroupActionState($contact, [
            'group_action_status' => 'invite_sent',
            'group_action_reason' => null,
            'group_action_message' => null,
            'last_target_group_jid' => $targetGroupId,
            'last_target_group_name' => $targetGroupName ?: ($result['group_name'] ?? null),
            'invite_sent_at' => now(),
            'invite_link' => $result['invite_link'] ?? $contact->invite_link,
        ]);

        return response()->json([
            ...$response->json(),
            'contact' => $updatedContact,
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

        $effectivePhone = trim((string) ($contact->resolved_phone ?: $contact->phone));
        $effectiveLid = preg_replace('/\D+/', '', (string) ($contact->lid ?? '')) ?: null;
        $looksPoisoned = $this->looksLikeLid($effectivePhone)
            || ($effectiveLid !== null && $effectivePhone === $effectiveLid);

        if (($contact->is_unresolved_lid && !filled($contact->resolved_phone)) || $looksPoisoned) {
            return response()->json([
                'message' => 'This group member still has an unresolved WhatsApp LID. Wait until the real phone number is resolved before converting.',
            ], 422);
        }

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

        $phoneForLead = $effectivePhone;
        $requestedPhoneCountry = trim((string) $request->input('phone_country', ''));
        $effectivePhoneCountry = $this->inferPhoneCountryCode($phoneForLead, $requestedPhoneCountry !== '' ? $requestedPhoneCountry : null) ?? '';
        $normalizedPhone = PhoneNormalizer::normalize($phoneForLead, $effectivePhoneCountry !== '' ? $effectivePhoneCountry : null);
        if ($normalizedPhone === '') {
            $normalizedPhone = PhoneNormalizer::normalize($phoneForLead, null);
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
            'phone' => $normalizedPhone !== '' ? $normalizedPhone : $phoneForLead,
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
