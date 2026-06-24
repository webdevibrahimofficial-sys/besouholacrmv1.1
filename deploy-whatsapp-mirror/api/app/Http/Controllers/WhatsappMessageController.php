<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\WhatsappMessage;
use App\Services\Whatsapp\WhatsappProviderResolver;
use App\Support\LeadPhoneMatcher;
use App\Support\PhoneNormalizer;

class WhatsappMessageController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->latest()->limit(50)->get();
        return response()->json($messages);
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

    public function leadMessages(Request $request, $leadId)
    {
        $user = Auth::user();
        $lead = \App\Models\Lead::findOrFail($leadId);
        $phoneVariants = LeadPhoneMatcher::buildPhoneVariants((string) ($lead->phone ?? ''));

        if (empty($phoneVariants)) {
            return response()->json([]);
        }

        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->where(function($q) use ($phoneVariants) {
                foreach ($phoneVariants as $variant) {
                    $q->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function(WhatsappMessage $m) {
                return [
                    'body' => $m->body,
                    'direction' => $m->direction,
                    'timestamp' => $m->created_at?->toISOString(),
                    'status' => $this->mapStatus($m->status),
                    'type' => $m->type,
                    'id' => $m->id,
                ];
            });
        return response()->json($messages);
    }

    public function sendTemplateV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'template_name' => 'required|string',
            'variables' => 'array',
            'variables.*' => 'nullable',
            'language' => 'nullable|string',
        ]);
        $recipientNumber = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->sendTemplate(
            (int) $user->tenant_id,
            $recipientNumber,
            $validated['template_name'],
            $validated['language'] ?? 'en_US',
            $validated['variables'] ?? []
        );

        return response()->json(array_merge(['ok' => (bool) ($result['ok'] ?? $result['success'] ?? true)], $result));
    }

    public function sendTextV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'message_body' => 'required|string',
        ]);
        $digits = $this->normalizeRecipientNumber((string) $validated['recipient_number']);

        if ($providerResolver->activeProviderKey((int) $user->tenant_id) === 'meta') {
            $phoneVariants = LeadPhoneMatcher::buildPhoneVariants($digits);
            $lastInbound = WhatsappMessage::where('tenant_id', $user->tenant_id)
                ->where('direction', 'inbound')
                ->where(function ($query) use ($phoneVariants) {
                    foreach ($phoneVariants as $variant) {
                        $query->orWhere('from', $variant);
                    }
                })
                ->orderBy('created_at', 'desc')
                ->first();
            if (!$lastInbound || now()->diffInHours($lastInbound->created_at) > 24) {
                return response()->json([
                    'ok' => false,
                    'error' => 'outside_24h_window',
                    'message' => 'لا يمكن إرسال رسالة حرة. مر أكثر من 24 ساعة على آخر رسالة من العميل. الرجاء استخدام قالب لبدء محادثة جديدة.'
                ], 422);
            }
        }

        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->sendText((int) $user->tenant_id, $digits, $validated['message_body']);

        return response()->json(array_merge(['ok' => (bool) ($result['ok'] ?? $result['success'] ?? true)], $result));
    }

    private function mapStatus(?string $status): string
    {
        if (!$status) return 'sent';
        switch ($status) {
            case 'accepted': return 'sent';
            case 'received': return 'delivered';
            case 'read': return 'read';
            default: return $status;
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
}
