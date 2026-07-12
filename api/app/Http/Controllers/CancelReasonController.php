<?php

namespace App\Http\Controllers;

use App\Models\CancelReason;
use App\Models\LeadAction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CancelReasonController extends Controller
{
    public function index()
    {
        return CancelReason::all();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'title_ar' => 'nullable|string|max:255',
        ]);

        $cancelReason = CancelReason::create($validated);
        return response()->json($cancelReason, 201);
    }

    public function show(CancelReason $cancelReason)
    {
        return $cancelReason;
    }

    public function update(Request $request, CancelReason $cancelReason)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'title_ar' => 'nullable|string|max:255',
        ]);

        $cancelReason->update($validated);
        return response()->json($cancelReason);
    }

    public function usage(Request $request, CancelReason $cancelReason): JsonResponse
    {
        $stats = $this->collectUsageStats($cancelReason);

        return response()->json([
            'cancel_reason' => [
                'id' => $cancelReason->id,
                'title' => $cancelReason->title,
                'title_ar' => $cancelReason->title_ar,
            ],
            'linked_actions_count' => $stats['linked_actions_count'],
            'needs_replacement' => $stats['linked_actions_count'] > 0,
        ]);
    }

    public function replaceAndDelete(Request $request, CancelReason $cancelReason): JsonResponse
    {
        $validated = $request->validate([
            'replacement_reason_id' => 'required|integer|exists:cancel_reasons,id',
        ]);

        $replacement = CancelReason::query()
            ->whereKey((int) $validated['replacement_reason_id'])
            ->firstOrFail();

        if ((int) $replacement->id === (int) $cancelReason->id) {
            return response()->json([
                'message' => 'Replacement reason must be different from the deleted reason.',
            ], 422);
        }

        $stats = DB::transaction(function () use ($cancelReason, $replacement) {
            $actions = LeadAction::query()
                ->where(function ($query) {
                    $query->where('action_type', 'cancel')
                        ->orWhere('next_action_type', 'cancel');
                })
                ->orderBy('id')
                ->get();

            $updatedActions = 0;

            foreach ($actions as $action) {
                if ($this->updateActionReasonPayload($action, $cancelReason, $replacement)) {
                    $updatedActions++;
                }
            }

            $cancelReason->delete();

            return [
                'updated_actions_count' => $updatedActions,
            ];
        });

        return response()->json([
            'message' => 'Cancel reason replaced and deleted successfully.',
            'deleted_reason_id' => $cancelReason->id,
            'replacement_reason' => [
                'id' => $replacement->id,
                'title' => $replacement->title,
                'title_ar' => $replacement->title_ar,
            ],
            'updated_actions_count' => $stats['updated_actions_count'],
        ]);
    }

    public function destroy(CancelReason $cancelReason)
    {
        $stats = $this->collectUsageStats($cancelReason);
        if ($stats['linked_actions_count'] > 0) {
            return response()->json([
                'message' => 'This cancel reason is linked to existing cancelled actions. Replace it before deleting.',
                'linked_actions_count' => $stats['linked_actions_count'],
                'cancel_reason' => [
                    'id' => $cancelReason->id,
                    'title' => $cancelReason->title,
                    'title_ar' => $cancelReason->title_ar,
                ],
            ], 409);
        }

        $cancelReason->delete();
        return response()->json(null, 204);
    }

    private function collectUsageStats(CancelReason $cancelReason): array
    {
        $title = trim((string) $cancelReason->title);
        $titleAr = trim((string) $cancelReason->title_ar);
        $titleLower = mb_strtolower($title);
        $titleArLower = mb_strtolower($titleAr);

        $actions = LeadAction::query()
            ->where(function ($query) {
                $query->where('action_type', 'cancel')
                    ->orWhere('next_action_type', 'cancel');
            })
            ->get(['id', 'description', 'details']);

        $linked = 0;

        foreach ($actions as $action) {
            if ($this->actionReferencesReason($action, $cancelReason, $titleLower, $titleArLower)) {
                $linked++;
            }
        }

        return [
            'linked_actions_count' => $linked,
        ];
    }

    private function actionReferencesReason(LeadAction $action, CancelReason $reason, string $titleLower, string $titleArLower): bool
    {
        $details = $action->details;
        if (!is_array($details)) {
            $details = json_decode((string) $details, true) ?: [];
        }

        if ((int) ($details['cancel_reason_id'] ?? $details['cancelReasonId'] ?? 0) === (int) $reason->id) {
            return true;
        }

        $directValues = array_filter([
            $details['cancelReason'] ?? null,
            $details['cancel_reason'] ?? null,
            $details['reason'] ?? null,
            $details['reason_text'] ?? null,
            $action->description ?? null,
        ]);

        foreach ($directValues as $value) {
            $normalized = mb_strtolower(trim((string) $value));
            if ($normalized === '') {
                continue;
            }

            if ($normalized === $titleLower || $normalized === $titleArLower) {
                return true;
            }

            if ($titleLower !== '' && str_starts_with($normalized, $titleLower)) {
                return true;
            }

            if ($titleArLower !== '' && str_starts_with($normalized, $titleArLower)) {
                return true;
            }
        }

        foreach (($details['comments'] ?? []) as $comment) {
            if (!is_array($comment)) {
                continue;
            }

            $kind = strtolower(trim((string) ($comment['kind'] ?? '')));
            if ($kind !== 'cancel_reason') {
                continue;
            }

            if ((int) ($comment['cancel_reason_id'] ?? $comment['cancelReasonId'] ?? 0) === (int) $reason->id) {
                return true;
            }

            $commentText = mb_strtolower(trim((string) ($comment['text'] ?? '')));
            if ($commentText === '') {
                continue;
            }

            if ($commentText === $titleLower || $commentText === $titleArLower) {
                return true;
            }

            if ($titleLower !== '' && str_starts_with($commentText, $titleLower)) {
                return true;
            }

            if ($titleArLower !== '' && str_starts_with($commentText, $titleArLower)) {
                return true;
            }
        }

        return false;
    }

    private function updateActionReasonPayload(LeadAction $action, CancelReason $oldReason, CancelReason $replacement): bool
    {
        $details = $action->details;
        if (!is_array($details)) {
            $details = json_decode((string) $details, true) ?: [];
        }

        $changed = false;
        $replacementText = trim((string) ($replacement->title ?: $replacement->title_ar));
        $oldTitle = trim((string) $oldReason->title);
        $oldTitleAr = trim((string) $oldReason->title_ar);

        foreach (['cancel_reason_id', 'cancelReasonId'] as $key) {
            if ((int) ($details[$key] ?? 0) === (int) $oldReason->id) {
                $details[$key] = (int) $replacement->id;
                $changed = true;
            }
        }

        foreach (['cancelReason', 'cancel_reason', 'reason', 'reason_text'] as $key) {
            if (!isset($details[$key])) {
                continue;
            }

            $current = trim((string) $details[$key]);
            if ($current === '') {
                continue;
            }

            if ($this->textMatchesReason($current, $oldTitle, $oldTitleAr)) {
                $details[$key] = $replacementText;
                $changed = true;
            }
        }

        if (isset($details['description'])) {
            $description = trim((string) $details['description']);
            $updatedDescription = $this->replaceReasonPrefix($description, $oldTitle, $oldTitleAr, $replacementText);
            if ($updatedDescription !== $description) {
                $details['description'] = $updatedDescription;
                $changed = true;
            }
        }

        if (isset($details['comments']) && is_array($details['comments'])) {
            foreach ($details['comments'] as $index => $comment) {
                if (!is_array($comment)) {
                    continue;
                }

                $kind = strtolower(trim((string) ($comment['kind'] ?? '')));
                if ($kind !== 'cancel_reason') {
                    continue;
                }

                $commentChanged = false;
                if ((int) ($comment['cancel_reason_id'] ?? $comment['cancelReasonId'] ?? 0) === (int) $oldReason->id) {
                    $details['comments'][$index]['cancel_reason_id'] = (int) $replacement->id;
                    $details['comments'][$index]['cancelReasonId'] = (int) $replacement->id;
                    $commentChanged = true;
                }

                $text = trim((string) ($comment['text'] ?? ''));
                if ($text !== '' && $this->textMatchesReason($text, $oldTitle, $oldTitleAr)) {
                    $details['comments'][$index]['text'] = $replacementText;
                    $commentChanged = true;
                }

                $details['comments'][$index]['reason_title'] = $replacement->title;
                $details['comments'][$index]['reason_title_ar'] = $replacement->title_ar;
                if ($commentChanged) {
                    $changed = true;
                }
            }
        }

        if ($changed) {
            $action->details = $details;
            $action->save();
        }

        return $changed;
    }

    private function textMatchesReason(string $value, string $oldTitle, string $oldTitleAr): bool
    {
        $normalized = mb_strtolower(trim($value));
        if ($normalized === '') {
            return false;
        }

        foreach (array_filter([$oldTitle, $oldTitleAr]) as $candidate) {
            $candidateNormalized = mb_strtolower(trim((string) $candidate));
            if ($candidateNormalized === '') {
                continue;
            }

            if ($normalized === $candidateNormalized || str_starts_with($normalized, $candidateNormalized)) {
                return true;
            }
        }

        return false;
    }

    private function replaceReasonPrefix(string $text, string $oldTitle, string $oldTitleAr, string $replacementText): string
    {
        foreach (array_filter([$oldTitle, $oldTitleAr]) as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '') {
                continue;
            }

            $pattern = '/^' . preg_quote($candidate, '/') . '(\s*-\s*|\s+)/iu';
            if (preg_match($pattern, $text)) {
                return preg_replace($pattern, $replacementText . '$1', $text, 1) ?? $text;
            }

            if (mb_strtolower($text) === mb_strtolower($candidate)) {
                return $replacementText;
            }
        }

        return $text;
    }
}
