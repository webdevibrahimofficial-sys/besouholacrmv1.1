<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Item;
use App\Models\Project;
use App\Models\Source;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappConversationRead;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMessageAttribution;
use App\Models\WhatsappUnassignedContact;
use App\Models\Lead;
use App\Services\Whatsapp\WhatsappProviderResolver;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Services\Whatsapp\WhatsappContactStoreService;
use App\Services\Whatsapp\WhatsappLidResolutionService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use App\Services\Whatsapp\MetaCloudApiProvider;
use App\Services\TenantStorageService;
use App\Support\LeadPhoneMatcher;
use App\Support\PhoneNormalizer;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class WhatsappMessageController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->latest()->limit(50)->get();
        return response()->json($messages);
    }

    public function mirrorConversations(Request $request)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappMirrorInboxAccess($user)) {
            return $resp;
        }

        $validated = $request->validate([
            'search' => 'nullable|string|max:120',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:50',
        ]);

        $tenantId = (int) $user->tenant_id;
        $search = strtolower(trim((string) ($validated['search'] ?? '')));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);

        $messages = WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', 'mirror')
            ->with(['lead' => fn ($query) => $query->select($this->leadPreviewColumns())])
            ->latest()
            ->limit(2000)
            ->get();

        $conversations = [];

        $contactStore = app(WhatsappContactStoreService::class);
        $ownNumberDigits = $this->mirrorOwnNumberDigits($tenantId);
        $readMap = [];
        if (Schema::hasTable('whatsapp_conversation_reads')) {
            $readMap = WhatsappConversationRead::query()
                ->where('tenant_id', $tenantId)
                ->where('user_id', (int) $user->id)
                ->get(['conversation_key', 'last_read_at'])
                ->mapWithKeys(fn (WhatsappConversationRead $row) => [
                    (string) $row->conversation_key => $row->last_read_at,
                ])
                ->all();
        }

        foreach ($messages as $message) {
            $rawCounterpart = $this->resolveMessageCounterpart($message);
            $contact = $this->findMirrorContactForCounterpart($tenantId, $rawCounterpart, $message);
            $rawPhone = $this->extractMirrorPhoneFromMessage($message);

            // Heal missing phones from the persistent LID->phone cache / history
            // before we fall back to showing the raw WhatsApp LID identifier.
            if (
                (!$rawPhone || $this->looksLikeWhatsappLid((string) $rawPhone))
                && ($contact?->lid || $this->looksLikeWhatsappLid($rawCounterpart) || filled($message->counterpart_lid))
            ) {
                $lidCandidate = (string) ($contact?->lid
                    ?: $message->counterpart_lid
                    ?: ($this->looksLikeWhatsappLid($rawCounterpart) ? $rawCounterpart : ''));
                $storedPhone = $contactStore->resolvePhoneForLid($tenantId, $lidCandidate)
                    ?: $contactStore->resolveFromMessageHistory($tenantId, $lidCandidate);
                if ($storedPhone && !$this->looksLikeWhatsappLid($storedPhone) && !$this->isOwnMirrorNumber($storedPhone, $ownNumberDigits)) {
                    $rawPhone = $storedPhone;
                    if ($contact && !filled($contact->phone)) {
                        $contactStore->upsertContact($tenantId, [
                            'lid' => $lidCandidate,
                            'phone' => $storedPhone,
                            'source' => 'conversation_list_heal',
                        ]);
                        $contact->phone = $storedPhone;
                    }
                }
            }

            $counterpart = $this->chooseConversationCounterpart($rawCounterpart, $rawPhone, $contact, $ownNumberDigits);
            if ($counterpart === '') {
                continue;
            }

            if (!isset($conversations[$counterpart])) {
                $lead = $message->lead;
                $displayName = trim((string) ($lead?->name ?? ''));
                $contactName = trim((string) ($contact?->name ?: $contact?->push_name ?: $contact?->verified_name ?: ''));
                $counterpartIsLid = $this->looksLikeWhatsappLid($counterpart)
                    || $this->looksLikeWhatsappLid((string) ($message->counterpart_lid ?: ''))
                    || $this->looksLikeWhatsappLid($rawCounterpart);
                $resolvedContactPhone = filled($contact?->phone) && !$this->looksLikeWhatsappLid((string) $contact->phone)
                    ? trim((string) $contact->phone)
                    : null;
                $displayPhone = $counterpartIsLid
                    ? ($resolvedContactPhone ?: $rawPhone)
                    : $counterpart;
                $displayPhone = filled($displayPhone) && !$this->looksLikeWhatsappLid((string) $displayPhone)
                    ? trim((string) $displayPhone)
                    : null;
                $isUnresolvedLid = $counterpartIsLid && !filled($displayPhone);
                $fallbackName = $displayName !== ''
                    ? $displayName
                    : ($contactName !== ''
                        ? $contactName
                        : ($displayPhone ?: null));

                $conversations[$counterpart] = [
                    'id' => $counterpart,
                    'phone' => $counterpart,
                    'display_phone' => $displayPhone,
                    'lid' => $this->normalizeLidDigits(
                        (string) ($message->counterpart_lid
                            ?: ($this->looksLikeWhatsappLid($rawCounterpart) ? $rawCounterpart : ($counterpartIsLid ? $counterpart : '')))
                    ),
                    'is_unresolved_lid' => $isUnresolvedLid,
                    'name' => $fallbackName,
                    'lead_id' => $lead?->id,
                    'lead_name' => $displayName ?: null,
                    'last_message' => $this->formatWhatsappMessage($message, $tenantId),
                    'last_message_at' => $message->created_at?->toISOString(),
                    'total_messages' => 0,
                    'inbound_messages' => 0,
                    'outbound_messages' => 0,
                    'unread_count' => 0,
                    '_stop_unread_streak' => false,
                ];
            } elseif (!$conversations[$counterpart]['lead_id'] && $message->lead) {
                $conversations[$counterpart]['lead_id'] = $message->lead->id;
                $conversations[$counterpart]['lead_name'] = $message->lead->name;
                $conversations[$counterpart]['name'] = $message->lead->name ?: $conversations[$counterpart]['name'];
            }

            if (
                empty($conversations[$counterpart]['display_phone'])
                && filled($rawPhone)
                && !$this->looksLikeWhatsappLid((string) $rawPhone)
            ) {
                $conversations[$counterpart]['display_phone'] = trim((string) $rawPhone);
                $conversations[$counterpart]['is_unresolved_lid'] = false;
                if (!filled($conversations[$counterpart]['name'])) {
                    $conversations[$counterpart]['name'] = $conversations[$counterpart]['display_phone'];
                }
            }

            $conversations[$counterpart]['total_messages'] += 1;
            $lastReadAt = $this->resolveConversationLastReadAt($readMap, $counterpart, $conversations[$counterpart]);

            if ($message->direction === 'outbound') {
                $conversations[$counterpart]['outbound_messages'] += 1;
                // For never-opened chats, stop counting once we hit an outbound
                // message while walking newest -> oldest (WhatsApp-like tip streak).
                if (!$lastReadAt) {
                    $conversations[$counterpart]['_stop_unread_streak'] = true;
                }
            } else {
                $conversations[$counterpart]['inbound_messages'] += 1;

                $shouldCountUnread = false;
                if ($lastReadAt) {
                    $shouldCountUnread = $message->created_at && $message->created_at->gt($lastReadAt);
                } elseif (empty($conversations[$counterpart]['_stop_unread_streak'])) {
                    $shouldCountUnread = true;
                }

                if ($shouldCountUnread) {
                    $conversations[$counterpart]['unread_count'] += 1;
                }
            }
        }

        foreach ($conversations as &$conversation) {
            unset($conversation['_stop_unread_streak']);
        }
        unset($conversation);

        foreach ($conversations as $counterpart => &$conversation) {
            // Prefer the real dialable number for lead matching.
            $matchPhones = [];
            foreach ([
                $conversation['display_phone'] ?? null,
                $counterpart,
            ] as $candidate) {
                $candidate = trim((string) ($candidate ?? ''));
                if ($candidate === '' || $this->looksLikeWhatsappLid($candidate)) {
                    continue;
                }
                $matchPhones[$candidate] = true;
            }
            $conversation['_match_phones'] = array_keys($matchPhones);
        }
        unset($conversation);

        $phonesToMatch = [];
        foreach ($conversations as $conversation) {
            foreach ($conversation['_match_phones'] as $matchPhone) {
                $phonesToMatch[$matchPhone] = true;
            }
        }

        $leadsByPhone = LeadPhoneMatcher::mapPhonesToLeads($tenantId, array_keys($phonesToMatch));

        // Fill any lead_id already present on messages but missing a name.
        $missingLeadIds = [];
        foreach ($conversations as $conversation) {
            if (!empty($conversation['lead_id']) && empty($conversation['lead_name'])) {
                $missingLeadIds[(int) $conversation['lead_id']] = true;
            }
        }
        $leadsById = !empty($missingLeadIds)
            ? Lead::query()
                ->where('tenant_id', $tenantId)
                ->whereIn('id', array_keys($missingLeadIds))
                ->get(['id', 'name'])
                ->keyBy('id')
            : collect();

        foreach ($conversations as $counterpart => &$conversation) {
            if (!empty($conversation['lead_id']) && empty($conversation['lead_name'])) {
                $lead = $leadsById->get((int) $conversation['lead_id']);
                if ($lead) {
                    $leadName = trim((string) $lead->name);
                    $conversation['lead_name'] = $leadName !== '' ? $leadName : null;
                    if ($leadName !== '') {
                        $conversation['name'] = $leadName;
                    }
                }
            }

            if (!empty($conversation['lead_name'])) {
                $conversation['name'] = $conversation['lead_name'];
                unset($conversation['_match_phones']);
                continue;
            }

            $matchedLead = null;
            foreach ($conversation['_match_phones'] as $matchPhone) {
                if (isset($leadsByPhone[$matchPhone])) {
                    $matchedLead = $leadsByPhone[$matchPhone];
                    break;
                }
            }
            unset($conversation['_match_phones']);

            if (!$matchedLead) {
                continue;
            }

            $leadName = trim((string) $matchedLead->name);
            $conversation['lead_id'] = $matchedLead->id;
            $conversation['lead_name'] = $leadName !== '' ? $leadName : null;
            if ($leadName !== '') {
                $conversation['name'] = $leadName;
            }
        }
        unset($conversation);

        $items = array_values(array_filter($conversations, function (array $conversation) use ($search) {
            if ($search === '') {
                return true;
            }

            return str_contains(strtolower((string) $conversation['phone']), $search)
                || str_contains(strtolower((string) ($conversation['display_phone'] ?? '')), $search)
                || str_contains(strtolower((string) ($conversation['name'] ?? '')), $search)
                || str_contains(strtolower((string) ($conversation['lead_name'] ?? '')), $search)
                || str_contains(strtolower((string) ($conversation['last_message']['body'] ?? '')), $search);
        }));

        usort($items, fn (array $a, array $b) => strcmp(
            (string) ($b['last_message_at'] ?? ''),
            (string) ($a['last_message_at'] ?? '')
        ));

        foreach ($items as &$conversation) {
            $rawDisplayPhone = trim((string) ($conversation['display_phone'] ?? ''));
            $formattedDisplayPhone = $this->formatInternationalDisplayPhone($rawDisplayPhone);
            if ($formattedDisplayPhone !== null) {
                $rawDigits = PhoneNormalizer::digits($rawDisplayPhone);
                $name = trim((string) ($conversation['name'] ?? ''));
                if (
                    $name !== ''
                    && empty($conversation['lead_name'])
                    && PhoneNormalizer::digits($name) === $rawDigits
                ) {
                    $conversation['name'] = $formattedDisplayPhone;
                }
                $conversation['display_phone'] = $formattedDisplayPhone;
            }
        }
        unset($conversation);

        $paginator = new LengthAwarePaginator(
            array_slice($items, ($page - 1) * $perPage, $perPage),
            count($items),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        return response()->json($paginator);
    }

    public function mirrorCreateLeadFromConversation(
        Request $request,
        WhatsappUnassignedContactService $unassignedContactService
    ) {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappMirrorInboxAccess($user)) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'phone' => 'required|string|max:80',
            'display_phone' => 'nullable|string|max:80',
            'lid' => 'nullable|string|max:80',
            'lead_id' => 'nullable|integer',
            'name' => 'required_without:lead_id|nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'company' => 'nullable|string|max:255',
            'campaign' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'source' => 'nullable|string|max:255',
            'stage' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:255',
            'priority' => 'nullable|string|max:255',
            'estimated_value' => 'nullable|numeric',
            'project_id' => 'nullable|integer',
            'item_id' => 'nullable|integer',
            'assigned_to' => 'nullable|integer',
            'phone_country' => 'nullable|string|max:10',
            'type' => 'nullable|string|max:50',
            'workflow_key' => 'nullable|string|max:50',
            'project' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $phoneCandidate = trim((string) (
            $request->input('display_phone')
            ?: $request->input('phone')
        ));
        if ($phoneCandidate === '' || $this->looksLikeWhatsappLid($phoneCandidate)) {
            return response()->json([
                'message' => 'A real phone number is required before creating a lead.',
            ], 422);
        }

        $tenantId = (int) $user->tenant_id;

        if ($request->filled('lead_id')) {
            $lead = Lead::query()
                ->where('tenant_id', $tenantId)
                ->find((int) $request->input('lead_id'));

            if (!$lead) {
                return response()->json([
                    'message' => 'Lead not found for this tenant.',
                ], 404);
            }

            DB::transaction(function () use (
                $lead,
                $tenantId,
                $phoneCandidate,
                $unassignedContactService,
                $request
            ) {
                $unassignedContactService->attachLeadToMatchingMessages($tenantId, $lead);
                $unassignedContactService->markAsConverted(
                    $tenantId,
                    $phoneCandidate,
                    (int) $lead->id,
                    trim((string) ($request->input('name') ?: $lead->name)) ?: null,
                    trim((string) $request->input('notes')) ?: null
                );

                if (Schema::hasTable('whatsapp_unassigned_contacts')) {
                    WhatsappUnassignedContact::query()
                        ->where('tenant_id', $tenantId)
                        ->where('status', 'pending')
                        ->where(function ($query) use ($phoneCandidate) {
                            $variants = LeadPhoneMatcher::buildPhoneVariants($phoneCandidate);
                            foreach ($variants as $variant) {
                                $query->orWhere('phone', $variant);
                            }
                        })
                        ->update([
                            'status' => 'converted',
                            'converted_lead_id' => $lead->id,
                        ]);
                }
            });

            return response()->json([
                'ok' => true,
                'lead' => $lead->load(['creator:id,name', 'assignedAgent:id,name']),
                'already_existed' => true,
                'linked_existing' => true,
            ]);
        }

        if ($request->filled('project_id')) {
            $projectExists = Project::query()
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $request->input('project_id'))
                ->exists();

            if (!$projectExists) {
                return response()->json([
                    'errors' => ['project_id' => ['Selected project does not exist for this tenant.']],
                ], 422);
            }
        }

        if ($request->filled('item_id')) {
            $itemExists = Item::query()
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $request->input('item_id'))
                ->exists();

            if (!$itemExists) {
                return response()->json([
                    'errors' => ['item_id' => ['Selected item does not exist for this tenant.']],
                ], 422);
            }
        }

        if ($request->filled('assigned_to')) {
            $assigneeExists = User::query()
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $request->input('assigned_to'))
                ->exists();

            if (!$assigneeExists) {
                return response()->json([
                    'errors' => ['assigned_to' => ['Selected assignee does not exist for this tenant.']],
                ], 422);
            }
        }

        $requestedPhoneCountry = trim((string) $request->input('phone_country', ''));
        $effectivePhoneCountry = $this->inferPhoneCountryCode(
            $phoneCandidate,
            $requestedPhoneCountry !== '' ? $requestedPhoneCountry : null
        ) ?? '';
        $normalizedPhone = PhoneNormalizer::normalize(
            $phoneCandidate,
            $effectivePhoneCountry !== '' ? $effectivePhoneCountry : null
        );
        if ($normalizedPhone === '') {
            $normalizedPhone = PhoneNormalizer::normalize($phoneCandidate, null);
        }

        $existingLead = LeadPhoneMatcher::findLeadByPhone($tenantId, $phoneCandidate);
        if ($existingLead) {
            $unassignedContactService->attachLeadToMatchingMessages($tenantId, $existingLead);
            $unassignedContactService->markAsConverted(
                $tenantId,
                $phoneCandidate,
                (int) $existingLead->id,
                null,
                null
            );

            return response()->json([
                'ok' => true,
                'lead' => $existingLead->load(['creator:id,name', 'assignedAgent:id,name']),
                'already_existed' => true,
            ]);
        }

        $attribution = $this->findAttributionForPhone($tenantId, $phoneCandidate);
        $defaultSourceName = $attribution ? 'WhatsApp CTWA' : 'WhatsApp Mirror';
        $requestedSource = trim((string) $request->input('source', ''));
        $sourceName = $requestedSource !== '' ? $requestedSource : $defaultSourceName;
        $resolvedSourceName = Source::withoutGlobalScopes()->firstOrCreate(
            [
                'tenant_id' => $tenantId,
                'name' => $sourceName,
            ],
            [
                'is_active' => true,
            ]
        )->name;

        $leadPayload = array_filter([
            'source' => $resolvedSourceName,
            'name' => trim((string) $request->input('name')),
            'phone' => $normalizedPhone !== '' ? $normalizedPhone : $phoneCandidate,
            'email' => trim((string) $request->input('email', '')),
            'company' => trim((string) $request->input('company', '')),
            'campaign' => trim((string) (
                $request->input('campaign')
                ?: ($attribution?->campaign_name ?: $attribution?->ad_name ?: $attribution?->headline ?: '')
            )),
            'country' => trim((string) $request->input('country', '')),
            'notes' => trim((string) $request->input('notes', '')),
            'stage' => trim((string) $request->input('stage', 'New Lead')),
            'status' => trim((string) $request->input('status', 'new')),
            'priority' => trim((string) $request->input('priority', 'medium')),
            'type' => trim((string) $request->input('type', '')),
            'workflow_key' => trim((string) $request->input('workflow_key', '')),
            'project' => trim((string) $request->input('project', '')),
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
            ->where('tenant_id', $tenantId)
            ->findOrFail($leadId);

        if (!filled($lead->phone) && $normalizedPhone !== '') {
            $lead->forceFill(['phone' => $normalizedPhone])->save();
            $lead->refresh();
        }

        if ($attribution) {
            $meta = is_array($lead->meta_data) ? $lead->meta_data : [];
            $meta['ctwa'] = array_filter([
                'source_id' => $attribution->source_id,
                'headline' => $attribution->headline,
                'ad_name' => $attribution->ad_name,
                'campaign_name' => $attribution->campaign_name,
                'ctwa_clid' => $attribution->ctwa_clid,
            ]);
            $lead->forceFill(['meta_data' => $meta])->save();
        }

        DB::transaction(function () use (
            $lead,
            $tenantId,
            $phoneCandidate,
            $unassignedContactService,
            $attribution,
            $request
        ) {
            $unassignedContactService->attachLeadToMatchingMessages($tenantId, $lead);
            $unassignedContactService->markAsConverted(
                $tenantId,
                $phoneCandidate,
                (int) $lead->id,
                trim((string) $request->input('name')) ?: null,
                trim((string) $request->input('notes')) ?: null
            );

            if ($attribution) {
                $variants = LeadPhoneMatcher::buildPhoneVariants($phoneCandidate);
                WhatsappMessageAttribution::query()
                    ->where('tenant_id', $tenantId)
                    ->whereNull('lead_id')
                    ->whereHas('message', function ($q) use ($tenantId, $variants) {
                        $q->where('tenant_id', $tenantId)
                            ->where(function ($inner) use ($variants) {
                                foreach ($variants as $variant) {
                                    $inner->orWhere('from', $variant)->orWhere('to', $variant);
                                }
                            });
                    })
                    ->update(['lead_id' => $lead->id]);
            }

            if (Schema::hasTable('whatsapp_unassigned_contacts')) {
                WhatsappUnassignedContact::query()
                    ->where('tenant_id', $tenantId)
                    ->where('status', 'pending')
                    ->where(function ($query) use ($phoneCandidate) {
                        $variants = LeadPhoneMatcher::buildPhoneVariants($phoneCandidate);
                        foreach ($variants as $variant) {
                            $query->orWhere('phone', $variant);
                        }
                    })
                    ->update([
                        'status' => 'converted',
                        'converted_lead_id' => $lead->id,
                    ]);
            }
        });

        return response()->json([
            'ok' => true,
            'lead' => $lead->load(['creator:id,name', 'assignedAgent:id,name']),
            'already_existed' => false,
        ]);
    }

    public function mirrorResolveConversationPhones(Request $request, WhatsappLidResolutionService $lidResolutionService)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappMirrorInboxAccess($user)) {
            return $resp;
        }

        $validated = $request->validate([
            'lids' => 'nullable|array|max:200',
            'lids.*' => 'nullable|string|max:80',
        ]);

        $result = $lidResolutionService->resolveForTenant(
            (int) $user->tenant_id,
            isset($validated['lids']) ? array_values(array_filter($validated['lids'])) : null
        );

        $status = match ($result['skipped_reason'] ?? null) {
            'mirror_not_connected' => 409,
            'mirror_request_failed' => 502,
            default => 200,
        };

        $message = match ($result['skipped_reason'] ?? null) {
            'mirror_not_connected' => 'WhatsApp Mirror session is not connected. Connect Mirror first, then retry.',
            'mirror_request_failed' => 'Failed to reach WhatsApp Mirror resolution service.',
            'nothing_to_resolve' => 'No unresolved WhatsApp IDs found.',
            default => null,
        };

        return response()->json(array_filter([
            'ok' => ($result['skipped_reason'] ?? null) === null || ($result['skipped_reason'] ?? null) === 'nothing_to_resolve',
            'message' => $message,
            'result' => $result,
        ], fn ($value) => $value !== null), $status);
    }

    public function mirrorMarkConversationRead(Request $request)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappMirrorInboxAccess($user)) {
            return $resp;
        }

        if (!Schema::hasTable('whatsapp_conversation_reads')) {
            return response()->json([
                'ok' => false,
                'message' => 'Conversation read tracking is not available yet. Run migrations first.',
            ], 503);
        }

        $validated = $request->validate([
            'phone' => 'required|string|max:80',
            'lid' => 'nullable|string|max:80',
            'display_phone' => 'nullable|string|max:80',
        ]);

        $tenantId = (int) $user->tenant_id;
        $keys = collect([
            $validated['phone'] ?? null,
            $validated['display_phone'] ?? null,
            $validated['lid'] ?? null,
        ])
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->values();

        $now = now();
        foreach ($keys as $key) {
            WhatsappConversationRead::query()->updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'user_id' => (int) $user->id,
                    'conversation_key' => $key,
                ],
                [
                    'last_read_at' => $now,
                ]
            );
        }

        return response()->json([
            'ok' => true,
            'last_read_at' => $now->toISOString(),
            'keys' => $keys->all(),
        ]);
    }

    public function mirrorConversationMessages(Request $request)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappMirrorInboxAccess($user)) {
            return $resp;
        }

        $validated = $request->validate([
            'phone' => 'required|string|max:80',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $tenantId = (int) $user->tenant_id;
        $phone = trim((string) $validated['phone']);
        $contactStore = app(WhatsappContactStoreService::class);
        $ownNumberDigits = $this->mirrorOwnNumberDigits($tenantId);
        $selectedContact = $this->findMirrorContactForCounterpart($tenantId, $phone);
        $resolvedFromStore = null;
        $lidCandidate = (string) ($selectedContact?->lid
            ?: ($this->looksLikeWhatsappLid($phone) ? $phone : '')
            ?: ($this->looksLikeWhatsappLid((string) ($selectedContact?->phone ?? '')) ? $selectedContact->phone : ''));
        if ($lidCandidate !== '') {
            $resolvedFromStore = $contactStore->resolvePhoneForLid($tenantId, $lidCandidate)
                ?: $contactStore->resolveFromMessageHistory($tenantId, $lidCandidate);
        }
        $selectedCounterpart = trim((string) (
            ($selectedContact?->phone && !$this->looksLikeWhatsappLid((string) $selectedContact->phone) ? $selectedContact->phone : null)
            ?: ($resolvedFromStore && !$this->looksLikeWhatsappLid($resolvedFromStore) ? $resolvedFromStore : null)
            ?: $phone
        ));
        $phoneVariants = LeadPhoneMatcher::buildPhoneVariants($selectedCounterpart);
        if (empty($phoneVariants)) {
            $phoneVariants = [$selectedCounterpart];
        }
        if ($resolvedFromStore && !$this->looksLikeWhatsappLid($resolvedFromStore)) {
            $phoneVariants = array_values(array_unique(array_merge(
                $phoneVariants,
                LeadPhoneMatcher::buildPhoneVariants($resolvedFromStore)
            )));
        }
        $selectedLid = $this->looksLikeWhatsappLid($phone)
            ? PhoneNormalizer::digits($phone)
            : ($selectedContact?->lid ?: ($this->looksLikeWhatsappLid($selectedCounterpart) ? PhoneNormalizer::digits($selectedCounterpart) : null));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 50);

        $messages = WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', 'mirror')
            ->orderBy('created_at', 'desc')
            ->limit(3000)
            ->get()
            ->filter(function (WhatsappMessage $message) use ($tenantId, $phoneVariants, $selectedLid, $contactStore, $ownNumberDigits) {
                $rawCounterpart = $this->resolveMessageCounterpart($message);
                $contact = $this->findMirrorContactForCounterpart($tenantId, $rawCounterpart, $message);
                $rawPhone = $this->extractMirrorPhoneFromMessage($message);
                if ((!$rawPhone || $this->looksLikeWhatsappLid((string) $rawPhone)) && ($contact?->lid || $this->looksLikeWhatsappLid($rawCounterpart) || filled($message->counterpart_lid))) {
                    $lidCandidate = (string) ($contact?->lid
                        ?: $message->counterpart_lid
                        ?: ($this->looksLikeWhatsappLid($rawCounterpart) ? $rawCounterpart : ''));
                    $storedPhone = $contactStore->resolvePhoneForLid($tenantId, $lidCandidate)
                        ?: $contactStore->resolveFromMessageHistory($tenantId, $lidCandidate);
                    if ($storedPhone && !$this->looksLikeWhatsappLid($storedPhone) && !$this->isOwnMirrorNumber($storedPhone, $ownNumberDigits)) {
                        $rawPhone = $storedPhone;
                    }
                }
                $counterpart = $this->chooseConversationCounterpart($rawCounterpart, $rawPhone, $contact, $ownNumberDigits);
                if ($counterpart === '') {
                    return false;
                }

                $messageHasDifferentRealPhone = !$this->looksLikeWhatsappLid($counterpart)
                    && empty(array_intersect($phoneVariants, LeadPhoneMatcher::buildPhoneVariants($counterpart)));

                if ($selectedLid && !$messageHasDifferentRealPhone && (
                    $message->counterpart_lid === $selectedLid
                    || $this->normalizeLidDigits((string) $rawCounterpart) === $selectedLid
                    || $this->normalizeLidDigits((string) $counterpart) === $selectedLid
                )) {
                    return true;
                }

                return !empty(array_intersect($phoneVariants, LeadPhoneMatcher::buildPhoneVariants($counterpart)));
            })
            ->values();

        $items = $messages
            ->slice(($page - 1) * $perPage, $perPage)
            ->map(fn (WhatsappMessage $message) => $this->formatWhatsappMessage($message, $tenantId))
            ->values()
            ->all();

        $paginator = new LengthAwarePaginator(
            $items,
            $messages->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        return response()->json($paginator);
    }

    public function sendTest(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }
        $validated = $request->validate([
            'api_key' => 'nullable|string',
            'phone_number_id' => 'nullable|string',
        ]);
        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->testConnection((int) $user->tenant_id, $validated);

        return response()->json($result);
    }

    public function capabilitiesV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $providerKey = $providerResolver->activeProviderKey((int) $user->tenant_id);

        return response()->json([
            'provider' => $providerKey,
            'media_supported' => in_array($providerKey, ['meta', 'mirror'], true),
            'templates_supported' => $providerKey === 'meta',
        ]);
    }

    public function leadMessages(Request $request, $leadId)
    {
        $user = Auth::user();
        $lead = Lead::where('tenant_id', $user->tenant_id)->findOrFail($leadId);
        $phoneVariants = LeadPhoneMatcher::buildLeadPhoneVariants($lead);

        if (empty($phoneVariants)) {
            if (!Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                return response()->json([]);
            }
        }

        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->where(function ($q) use ($phoneVariants, $lead) {
                if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                    $q->orWhere('lead_id', $lead->id);
                }

                foreach ($phoneVariants as $variant) {
                    $q->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->with('attribution')
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function (WhatsappMessage $m) use ($user) {
                $normalizedStatus = $this->mapStatus($m->status, $m->direction);

                if (
                    $m->direction === 'outbound'
                    && in_array($normalizedStatus, ['sent_to_baileys', 'sent_to_session'], true)
                    && $m->created_at
                    && $m->created_at->lt(now()->subSeconds(120))
                ) {
                    $normalizedStatus = 'unstable';
                }

                $attribution = $m->attribution;

                return [
                    'body' => $m->body,
                    'direction' => $m->direction,
                    'timestamp' => $m->created_at?->toISOString(),
                    'status' => $normalizedStatus,
                    'type' => $m->type,
                    'id' => $m->id,
                    'message_id' => $m->message_id,
                    'channel_id' => $m->channel_id,
                    'media' => $this->extractMediaPayload($m, (int) $user->tenant_id),
                    'attribution' => $attribution ? [
                        'source_id' => $attribution->source_id,
                        'headline' => $attribution->headline,
                        'ad_name' => $attribution->ad_name,
                        'campaign_name' => $attribution->campaign_name,
                        'source_type' => $attribution->source_type,
                    ] : null,
                ];
            });
        return response()->json($messages);
    }

    public function sendTemplateV1(
        Request $request,
        WhatsappProviderResolver $providerResolver,
        WhatsappChannelService $channelService
    ) {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'template_name' => 'required|string',
            'variables' => 'array',
            'variables.*' => 'nullable',
            'language' => 'nullable|string',
            'channel_id' => 'nullable|integer',
            'lead_id' => 'nullable|integer',
        ]);
        $recipientNumber = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $channelId = $channelService->resolveOutboundChannelId(
            (int) $user->tenant_id,
            $recipientNumber,
            isset($validated['channel_id']) ? (int) $validated['channel_id'] : null,
            isset($validated['lead_id']) ? (int) $validated['lead_id'] : null
        );
        $provider = $providerResolver->resolve((int) $user->tenant_id, $channelId);
        $result = $provider->sendTemplate(
            (int) $user->tenant_id,
            $recipientNumber,
            $validated['template_name'],
            $validated['language'] ?? 'en_US',
            $validated['variables'] ?? [],
            $channelId
        );

        return response()->json(array_merge([
            'ok' => (bool) ($result['ok'] ?? $result['success'] ?? true),
            'channel_id' => $channelId,
        ], $result));
    }

    public function sendTextV1(
        Request $request,
        WhatsappProviderResolver $providerResolver,
        WhatsappChannelService $channelService
    ) {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'message_body' => 'required|string',
            'channel_id' => 'nullable|integer',
            'lead_id' => 'nullable|integer',
        ]);
        $digits = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $channelId = $channelService->resolveOutboundChannelId(
            (int) $user->tenant_id,
            $digits,
            isset($validated['channel_id']) ? (int) $validated['channel_id'] : null,
            isset($validated['lead_id']) ? (int) $validated['lead_id'] : null
        );

        $provider = $providerResolver->resolve((int) $user->tenant_id, $channelId);
        $result = $provider->sendText((int) $user->tenant_id, $digits, $validated['message_body'], $channelId);

        return response()->json(array_merge([
            'ok' => (bool) ($result['ok'] ?? $result['success'] ?? true),
            'channel_id' => $channelId,
        ], $result));
    }

    public function sendMediaV1(
        Request $request,
        WhatsappProviderResolver $providerResolver,
        WhatsappChannelService $channelService,
        TenantStorageService $tenantStorageService
    ) {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'caption' => 'nullable|string|max:1024',
            'attachment' => 'required|file|max:51200',
            'channel_id' => 'nullable|integer',
            'lead_id' => 'nullable|integer',
        ]);

        $digits = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $channelId = $channelService->resolveOutboundChannelId(
            (int) $user->tenant_id,
            $digits,
            isset($validated['channel_id']) ? (int) $validated['channel_id'] : null,
            isset($validated['lead_id']) ? (int) $validated['lead_id'] : null
        );

        $providerKey = $providerResolver->activeProviderKey((int) $user->tenant_id, $channelId);
        if (!in_array($providerKey, ['meta', 'mirror'], true)) {
            throw ValidationException::withMessages([
                'attachment' => ['Media sending is currently available only with supported WhatsApp providers.'],
            ]);
        }

        $file = $request->file('attachment');
        $mediaType = $this->resolveMediaTypeFromMime((string) $file->getMimeType());
        $upload = $tenantStorageService->upload($file, 'whatsapp/attachments');

        $provider = $providerResolver->resolve((int) $user->tenant_id, $channelId);
        $result = $provider->sendMedia(
            (int) $user->tenant_id,
            $digits,
            $mediaType,
            $upload['url'],
            $validated['caption'] ?? null,
            $file->getClientOriginalName(),
            $channelId
        );

        $message = WhatsappMessage::query()->find($result['db_id'] ?? null);
        if ($message) {
            $raw = is_array($message->raw) ? $message->raw : [];
            $raw['request'] = array_merge($raw['request'] ?? [], [
                'attachment_path' => $upload['path'],
                'attachment_url' => $upload['url'],
                'mime_type' => $file->getMimeType(),
                'original_name' => $file->getClientOriginalName(),
                'caption' => $validated['caption'] ?? null,
            ]);
            $fill = [
                'raw' => $raw,
                'type' => in_array((string) ($message->type ?? ''), ['image', 'video', 'audio', 'document', 'sticker'], true)
                    ? $message->type
                    : $mediaType,
            ];
            if (trim((string) ($message->body ?? '')) === '' && trim((string) ($validated['caption'] ?? '')) !== '') {
                $fill['body'] = $validated['caption'];
            }
            $message->forceFill($fill)->save();
        }

        return response()->json(array_merge([
            'ok' => (bool) ($result['ok'] ?? $result['success'] ?? true),
            'channel_id' => $channelId,
        ], $result));
    }

    public function streamMediaV1(
        Request $request,
        WhatsappMessage $message,
        WhatsappProviderResolver $providerResolver,
        MetaCloudApiProvider $metaCloudApiProvider
    ) {
        $user = Auth::user();
        $hasAccess = $request->hasValidSignature(false)
            || ($user && (int) $message->tenant_id === (int) $user->tenant_id);

        abort_unless($hasAccess, 404);

        $storedPath = $this->resolveStoredMediaPath($message);
        if ($storedPath && Storage::disk('tenants')->exists($storedPath)) {
            $mime = Storage::disk('tenants')->mimeType($storedPath) ?: 'application/octet-stream';
            $filename = basename($storedPath);

            return Storage::disk('tenants')->response($storedPath, $filename, [
                'Content-Type' => $mime,
                'Content-Disposition' => 'inline; filename="' . addslashes($filename) . '"',
            ]);
        }

        $providerKey = strtolower((string) ($message->provider ?: $providerResolver->activeProviderKey((int) $message->tenant_id)));
        if ($providerKey !== 'meta') {
            abort(404);
        }

        $raw = is_array($message->raw) ? $message->raw : [];
        $mediaId = $this->extractMetaMediaId($raw, (string) $message->type);
        if (!$mediaId) {
            abort(404);
        }

        $media = $metaCloudApiProvider->downloadMedia((int) $message->tenant_id, $mediaId);
        $filename = $media['filename'] ?: ('whatsapp-media-' . $message->id);

        return response($media['body'], 200, [
            'Content-Type' => $media['mime_type'] ?: 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="' . addslashes($filename) . '"',
        ]);
    }

    private function mapStatus(?string $status, ?string $direction = null): string
    {
        if (!$status) {
            return $direction === 'outbound' ? 'sent_to_baileys' : 'received';
        }

        switch ($status) {
            case 'accepted':
            case 'sent':
            case 'sent_to_session':
            case 'sent_to_baileys':
                return $direction === 'outbound' ? 'sent_to_baileys' : 'sent';
            case 'received':
                return 'delivered';
            case 'read':
                return 'read';
            default:
                return $status;
        }
    }

    private function ensureWhatsappAdmin($user)
    {
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        $isTenantAdmin = $user->is_super_admin || in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'owner'], true);

        if ($isTenantAdmin) {
            return null;
        }

        return response()->json(['message' => 'Only tenant admins can manage WhatsApp settings.'], 403);
    }

    private function ensureWhatsappMirrorInboxAccess($user)
    {
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $roles = collect([
            $user->role ?? null,
            $user->job_title ?? null,
        ]);
        if (method_exists($user, 'roles')) {
            try {
                $roles = $roles->merge($user->roles->pluck('name'));
            } catch (\Throwable) {
                // Keep the check resilient if roles are not loaded or not configured.
            }
        }

        $isAllowed = $user->is_super_admin
            || $roles
                ->filter()
                ->map(fn ($role) => strtolower(trim((string) $role)))
                ->contains(fn ($role) => in_array($role, ['admin', 'tenant admin', 'tenant-admin', 'owner', 'director'], true)
                    || str_contains($role, 'director')
                    || str_contains($role, 'operation'));

        if ($isAllowed) {
            return null;
        }

        return response()->json(['message' => 'You are not authorized to view WhatsApp Mirror conversations.'], 403);
    }

    private function resolveConversationLastReadAt(array $readMap, string $counterpart, array $conversation)
    {
        foreach ([
            $counterpart,
            $conversation['display_phone'] ?? null,
            $conversation['lid'] ?? null,
            $conversation['phone'] ?? null,
        ] as $key) {
            $key = trim((string) ($key ?? ''));
            if ($key !== '' && array_key_exists($key, $readMap) && $readMap[$key]) {
                return $readMap[$key];
            }
        }

        return null;
    }

    private function leadPreviewColumns(): array
    {
        return array_values(array_filter(
            ['id', 'tenant_id', 'name', 'phone', 'mobile', 'whatsapp'],
            fn ($column) => Schema::hasColumn('leads', $column)
        ));
    }

    private function resolveMessageCounterpart(WhatsappMessage $message): string
    {
        $direction = strtolower((string) $message->direction);
        $value = $direction === 'outbound' ? $message->to : $message->from;
        $value = trim((string) $value);

        if ($value !== '') {
            return $value;
        }

        return trim((string) ($message->from ?: $message->to));
    }

    private function findMirrorContactForCounterpart(int $tenantId, string $counterpart, ?WhatsappMessage $message = null): ?WhatsappContact
    {
        if (!Schema::hasTable('whatsapp_contacts')) {
            return null;
        }

        $lid = trim((string) ($message?->counterpart_lid ?: ''));
        if ($lid === '' && $this->looksLikeWhatsappLid($counterpart)) {
            $lid = preg_replace('/\D+/', '', $counterpart) ?: '';
        }

        if ($lid !== '') {
            $contact = WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->where('lid', $lid)
                ->first();
            if ($contact) {
                return $contact;
            }
        }

        $digits = PhoneNormalizer::digits($counterpart);
        if ($digits !== '' && !$this->looksLikeWhatsappLid($digits)) {
            return WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->where('phone', $digits)
                ->first();
        }

        return null;
    }

    private function chooseConversationCounterpart(
        string $rawCounterpart,
        ?string $rawPhone,
        ?WhatsappContact $contact,
        array $ownNumberDigits = []
    ): string {
        $messagePhone = filled($rawPhone) && !$this->looksLikeWhatsappLid((string) $rawPhone)
            ? trim((string) $rawPhone)
            : (! $this->looksLikeWhatsappLid($rawCounterpart) ? trim($rawCounterpart) : '');
        $contactPhone = filled($contact?->phone) && !$this->looksLikeWhatsappLid((string) $contact->phone)
            ? trim((string) $contact->phone)
            : '';

        if ($this->isOwnMirrorNumber($messagePhone, $ownNumberDigits)) {
            $messagePhone = '';
        }
        if ($this->isOwnMirrorNumber($contactPhone, $ownNumberDigits)) {
            $contactPhone = '';
        }

        // A cached LID->phone mapping must never pull a message into a different
        // real-number thread when the message itself already has a phone.
        if ($messagePhone !== '' && $contactPhone !== '' && !$this->phonesLookSame($messagePhone, $contactPhone)) {
            return $messagePhone;
        }

        return trim((string) ($messagePhone ?: $contactPhone ?: $rawCounterpart));
    }

    private function mirrorOwnNumberDigits(int $tenantId): array
    {
        $sessionPhone = WhatsappMirrorSession::query()
            ->where('tenant_id', $tenantId)
            ->value('connected_phone_number');

        $digits = PhoneNormalizer::digits((string) $sessionPhone);
        if ($digits === '') {
            return [];
        }

        $out = [$digits => true, ltrim($digits, '0') => true];
        if (str_starts_with($digits, '20') && strlen($digits) > 2) {
            $out['0' . substr($digits, 2)] = true;
            $out[substr($digits, 2)] = true;
        }

        return $out;
    }

    private function isOwnMirrorNumber(string $phone, array $ownNumberDigits): bool
    {
        $digits = PhoneNormalizer::digits($phone);
        if ($digits === '' || $ownNumberDigits === []) {
            return false;
        }

        return isset($ownNumberDigits[$digits])
            || isset($ownNumberDigits[ltrim($digits, '0')]);
    }

    private function phonesLookSame(string $left, string $right): bool
    {
        $leftVariants = LeadPhoneMatcher::buildPhoneVariants($left);
        $rightVariants = LeadPhoneMatcher::buildPhoneVariants($right);

        if ($leftVariants && $rightVariants && array_intersect($leftVariants, $rightVariants)) {
            return true;
        }

        $leftDigits = PhoneNormalizer::digits($left);
        $rightDigits = PhoneNormalizer::digits($right);
        if ($leftDigits === '' || $rightDigits === '') {
            return false;
        }

        return str_ends_with($leftDigits, $rightDigits) || str_ends_with($rightDigits, $leftDigits);
    }

    private function extractMirrorPhoneFromMessage(WhatsappMessage $message): ?string
    {
        $raw = is_array($message->raw) ? $message->raw : [];
        $messagePayload = is_array($raw['message'] ?? null) ? $raw['message'] : $raw;
        $requestPayload = is_array($raw['request'] ?? null) ? $raw['request'] : [];
        $isOutbound = strtolower((string) $message->direction) === 'outbound';

        foreach ([
            // CRM send recipient is the source of truth for outbound messages.
            $isOutbound ? ($requestPayload['to'] ?? null) : null,
            $isOutbound ? ($message->to ?? null) : ($message->from ?? null),
            $messagePayload['resolved_phone'] ?? null,
            $messagePayload['counterpart_phone'] ?? null,
            $messagePayload['sender_pn'] ?? null,
            $messagePayload['participant_pn'] ?? null,
            $messagePayload['phone'] ?? null,
            $messagePayload['from'] ?? null,
            $messagePayload['to'] ?? null,
            $raw['resolved_phone'] ?? null,
            $raw['counterpart_phone'] ?? null,
            $raw['sender_pn'] ?? null,
            $raw['participant_pn'] ?? null,
            $raw['phone'] ?? null,
        ] as $value) {
            if (!is_scalar($value)) {
                continue;
            }

            $rawValue = trim((string) $value);
            if ($rawValue === '' || $this->looksLikeWhatsappLid($rawValue)) {
                continue;
            }

            $digits = PhoneNormalizer::digits(explode('@', $rawValue)[0] ?? $rawValue);
            // Real E.164 phones are typically <= 13 digits in our markets;
            // 14+ digit values are WhatsApp LID identifiers, not dialable numbers.
            if (strlen($digits) >= 7 && strlen($digits) <= 13) {
                return $digits;
            }
        }

        return null;
    }

    private function looksLikeWhatsappLid(string $value): bool
    {
        $raw = strtolower(trim($value));
        if ($raw === '') {
            return false;
        }

        if (str_contains($raw, '@lid')) {
            return true;
        }

        $digits = PhoneNormalizer::digits(explode('@', $raw)[0] ?? $raw);

        // Mirror/Baileys LID identifiers are commonly persisted as bare 14+ digit
        // strings (without the @lid suffix) in from/to. Treat those as LIDs so
        // the inbox never presents them as real phone numbers.
        return $digits !== '' && strlen($digits) >= 14;
    }

    private function normalizeLidDigits(string $value): ?string
    {
        if (!$this->looksLikeWhatsappLid($value)) {
            return null;
        }

        $digits = PhoneNormalizer::digits(explode('@', $value)[0] ?? $value);

        return $digits !== '' ? $digits : null;
    }

    private function formatWhatsappMessage(WhatsappMessage $message, int $tenantId): array
    {
        return [
            'id' => $message->id,
            'message_id' => $message->message_id,
            'body' => $this->resolveFormattedMessageBody($message),
            'direction' => $message->direction,
            'status' => $this->mapStatus($message->status, $message->direction),
            'type' => $message->type,
            'from' => $message->from,
            'to' => $message->to,
            'timestamp' => $message->created_at?->toISOString(),
            'media' => $this->extractMediaPayload($message, $tenantId),
        ];
    }

    private function resolveFormattedMessageBody(WhatsappMessage $message): string
    {
        $body = trim((string) ($message->body ?? ''));
        if ($body !== '') {
            return $body;
        }

        $raw = is_array($message->raw) ? $message->raw : [];
        $nestedMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $requestPayload = is_array($raw['request'] ?? null) ? $raw['request'] : [];
        $mirrorConfig = is_array($raw['mirror'] ?? null) ? $raw['mirror'] : [];
        $type = strtolower(trim((string) ($message->type ?? 'text')));
        $typePayload = is_array($raw[$type] ?? null) ? $raw[$type] : [];

        $candidates = [
            $nestedMessage['body'] ?? null,
            $raw['body'] ?? null,
            $requestPayload['body'] ?? null,
            $requestPayload['caption'] ?? null,
            $nestedMessage['caption'] ?? null,
            data_get($nestedMessage, 'media.caption'),
            $mirrorConfig['caption'] ?? null,
            $typePayload['caption'] ?? null,
            data_get($nestedMessage, 'text.body'),
            data_get($nestedMessage, 'conversation'),
            data_get($nestedMessage, 'extendedTextMessage.text'),
            data_get($raw, 'conversation'),
            data_get($raw, 'extendedTextMessage.text'),
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        return '';
    }

    private function normalizeRecipientNumber(string $rawPhone): string
    {
        $digits = preg_replace('/\D+/', '', trim($rawPhone));
        if ($digits === '') {
            return '';
        }

        $normalized = PhoneNormalizer::normalize($digits, '20');
        if ($normalized !== '' && str_starts_with($normalized, '0') && strlen($normalized) > 1) {
            return '20' . substr($normalized, 1);
        }

        if (str_starts_with($digits, '0') && strlen($digits) > 1) {
            return '20' . substr($digits, 1);
        }

        return ltrim($digits, '+');
    }

    /**
     * Format a dialable phone for UI display with an international "+" prefix.
     * Returns null for LIDs / unknown / non-phone values so callers can keep the raw label.
     */
    private function formatInternationalDisplayPhone(?string $value): ?string
    {
        $raw = trim((string) ($value ?? ''));
        if ($raw === '' || $this->looksLikeWhatsappLid($raw)) {
            return null;
        }

        $digits = PhoneNormalizer::digits($raw);
        if ($digits === '' || strlen($digits) < 7 || strlen($digits) >= 14) {
            return null;
        }

        $intlDigits = $this->normalizeRecipientNumber($digits);
        if ($intlDigits === '') {
            return null;
        }

        return '+' . ltrim($intlDigits, '+');
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

        if ($fallback) {
            $fallbackDigits = preg_replace('/\D+/', '', $fallback) ?? '';
            if ($fallbackDigits !== '') {
                return '+' . ltrim($fallbackDigits, '+');
            }

            if (preg_match('/^[A-Za-z]{2}$/', $fallback)) {
                $upper = strtoupper($fallback);

                return match ($upper) {
                    'EG' => '+20',
                    'SA' => '+966',
                    'AE', 'UAE' => '+971',
                    default => $fallback,
                };
            }
        }

        return $fallback ?: null;
    }

    private function findAttributionForPhone(int $tenantId, string $phone): ?WhatsappMessageAttribution
    {
        if (!Schema::hasTable('whatsapp_message_attributions')) {
            return null;
        }

        $variants = LeadPhoneMatcher::buildPhoneVariants($phone);
        if ($variants === []) {
            return null;
        }

        return WhatsappMessageAttribution::query()
            ->where('tenant_id', $tenantId)
            ->whereHas('message', function ($q) use ($tenantId, $variants) {
                $q->where('tenant_id', $tenantId)
                    ->where(function ($inner) use ($variants) {
                        foreach ($variants as $variant) {
                            $inner->orWhere('from', $variant)->orWhere('to', $variant);
                        }
                    });
            })
            ->orderByDesc('id')
            ->first();
    }

    private function resolveMediaTypeFromMime(string $mimeType): string
    {
        $mimeType = strtolower(trim($mimeType));

        if (str_starts_with($mimeType, 'image/')) {
            return 'image';
        }

        if (str_starts_with($mimeType, 'video/')) {
            return 'video';
        }

        if (str_starts_with($mimeType, 'audio/')) {
            return 'audio';
        }

        return 'document';
    }

    private function extractMediaPayload(WhatsappMessage $message, int $tenantId): ?array
    {
        $raw = is_array($message->raw) ? $message->raw : [];
        $requestPayload = is_array($raw['request'] ?? null) ? $raw['request'] : [];
        $mirrorConfig = is_array($raw['mirror'] ?? null) ? $raw['mirror'] : [];
        $mirrorMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $mirrorMedia = is_array($mirrorMessage['media'] ?? null) ? $mirrorMessage['media'] : [];
        $storage = app(TenantStorageService::class);

        $type = strtolower(trim((string) ($message->type ?? '')));
        $requestMimeType = trim((string) ($requestPayload['mime_type'] ?? $mirrorMedia['mime_type'] ?? ''));
        $inferredTypeFromMime = $requestMimeType !== '' ? $this->resolveMediaTypeFromMime($requestMimeType) : '';

        if (!in_array($type, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
            $type = strtolower(trim((string) (
                $mirrorConfig['media_type']
                ?? $mirrorMedia['type']
                ?? $inferredTypeFromMime
            )));
        }

        if (!in_array($type, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
            return null;
        }

        $typePayload = is_array($raw[$type] ?? null) ? $raw[$type] : [];
        $storedPath = $this->resolveStoredMediaPath($message);

        $url = null;
        if ($storedPath && $message->id) {
            $url = $storage->toRelativeUrl(
                URL::signedRoute('whatsapp.messages.media', ['message' => $message->id], now()->addMinutes(120))
            );
        }
        if (!$url && $storedPath) {
            $url = $storage->getBrowserUrl($storedPath);
        }

        if (!$url) {
            $absolute = $requestPayload['attachment_url']
                ?? $mirrorConfig['media_url']
                ?? $typePayload['link']
                ?? $typePayload['url']
                ?? $mirrorMedia['media_url']
                ?? $mirrorMessage['media_url']
                ?? $mirrorMedia['url']
                ?? $mirrorMessage['url']
                ?? null;
            $url = is_string($absolute) && $absolute !== '' ? $storage->toRelativeUrl($absolute) : null;
        }

        if (!$url && $message->provider === 'meta' && $this->extractMetaMediaId($raw, $type)) {
            $url = $storage->toRelativeUrl(
                URL::signedRoute('whatsapp.messages.media', ['message' => $message->id], now()->addMinutes(120))
            );
        }

        if (!$url) {
            return null;
        }

        return [
            'url' => $url,
            'mime_type' => $requestPayload['mime_type'] ?? $typePayload['mime_type'] ?? $mirrorMedia['mime_type'] ?? $mirrorMessage['mime_type'] ?? null,
            'filename' => $requestPayload['original_name'] ?? $typePayload['filename'] ?? $mirrorConfig['filename'] ?? $mirrorMedia['original_name'] ?? $mirrorMedia['file_name'] ?? $mirrorMessage['file_name'] ?? null,
            'caption' => $requestPayload['caption'] ?? $typePayload['caption'] ?? $mirrorConfig['caption'] ?? $mirrorMedia['caption'] ?? $mirrorMessage['caption'] ?? $message->body,
            'type' => $type,
        ];
    }

    private function resolveStoredMediaPath(WhatsappMessage $message): ?string
    {
        $raw = is_array($message->raw) ? $message->raw : [];
        $requestPayload = is_array($raw['request'] ?? null) ? $raw['request'] : [];
        $mirrorMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $mirrorMedia = is_array($mirrorMessage['media'] ?? null) ? $mirrorMessage['media'] : [];

        foreach ([
            $requestPayload['attachment_path'] ?? null,
            $mirrorMedia['attachment_path'] ?? null,
            $mirrorMessage['attachment_path'] ?? null,
        ] as $candidate) {
            $path = trim((string) $candidate);
            if ($path !== '') {
                return $path;
            }
        }

        return null;
    }

    private function extractMetaMediaId(array $raw, string $type): ?string
    {
        $typePayload = is_array($raw[$type] ?? null) ? $raw[$type] : null;
        $mediaId = $typePayload['id'] ?? null;

        return is_string($mediaId) && $mediaId !== '' ? $mediaId : null;
    }
}
