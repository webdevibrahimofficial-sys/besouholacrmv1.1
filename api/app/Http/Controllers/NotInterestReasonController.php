<?php

namespace App\Http\Controllers;

use App\Models\LeadAction;
use App\Models\NotInterestReason;
use App\Services\TelesalesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotInterestReasonController extends Controller
{
    public function index()
    {
        return NotInterestReason::all();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'title_ar' => 'nullable|string|max:255',
        ]);

        $reason = NotInterestReason::create($validated);

        return response()->json($reason, 201);
    }

    public function show(NotInterestReason $notInterestReason)
    {
        return $notInterestReason;
    }

    public function update(Request $request, NotInterestReason $notInterestReason)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'title_ar' => 'nullable|string|max:255',
        ]);

        $notInterestReason->update($validated);

        return response()->json($notInterestReason);
    }

    public function usage(Request $request, NotInterestReason $notInterestReason): JsonResponse
    {
        $stats = $this->collectUsageStats($notInterestReason);

        return response()->json([
            'not_interest_reason' => [
                'id' => $notInterestReason->id,
                'title' => $notInterestReason->title,
                'title_ar' => $notInterestReason->title_ar,
            ],
            'linked_actions_count' => $stats['linked_actions_count'],
            'needs_replacement' => $stats['linked_actions_count'] > 0,
        ]);
    }

    public function replaceAndDelete(Request $request, NotInterestReason $notInterestReason): JsonResponse
    {
        $validated = $request->validate([
            'replacement_reason_id' => 'required|integer|exists:not_interest_reasons,id',
        ]);

        $replacement = NotInterestReason::query()
            ->whereKey((int) $validated['replacement_reason_id'])
            ->firstOrFail();

        if ((int) $replacement->id === (int) $notInterestReason->id) {
            return response()->json([
                'message' => 'Replacement reason must be different from the deleted reason.',
            ], 422);
        }

        $stats = DB::transaction(function () use ($notInterestReason, $replacement) {
            $actions = LeadAction::query()
                ->whereHas('lead', function ($query) {
                    $query->where('workflow_key', TelesalesService::WORKFLOW_TELESALES);
                })
                ->orderBy('id')
                ->get();

            $updatedActions = 0;

            foreach ($actions as $action) {
                if ($this->updateActionReasonPayload($action, $notInterestReason, $replacement)) {
                    $updatedActions++;
                }
            }

            $notInterestReason->delete();

            return [
                'updated_actions_count' => $updatedActions,
            ];
        });

        return response()->json([
            'message' => 'Not interest reason replaced and deleted successfully.',
            'deleted_reason_id' => $notInterestReason->id,
            'replacement_reason' => [
                'id' => $replacement->id,
                'title' => $replacement->title,
                'title_ar' => $replacement->title_ar,
            ],
            'updated_actions_count' => $stats['updated_actions_count'],
        ]);
    }

    public function destroy(NotInterestReason $notInterestReason)
    {
        $stats = $this->collectUsageStats($notInterestReason);
        if ($stats['linked_actions_count'] > 0) {
            return response()->json([
                'message' => 'This not interest reason is linked to existing telesales actions. Replace it before deleting.',
                'linked_actions_count' => $stats['linked_actions_count'],
                'not_interest_reason' => [
                    'id' => $notInterestReason->id,
                    'title' => $notInterestReason->title,
                    'title_ar' => $notInterestReason->title_ar,
                ],
            ], 409);
        }

        $notInterestReason->delete();

        return response()->json(null, 204);
    }

    private function collectUsageStats(NotInterestReason $reason): array
    {
        $title = trim((string) $reason->title);
        $titleAr = trim((string) $reason->title_ar);
        $titleLower = mb_strtolower($title);
        $titleArLower = mb_strtolower($titleAr);

        $actions = LeadAction::query()
            ->whereHas('lead', function ($query) {
                $query->where('workflow_key', TelesalesService::WORKFLOW_TELESALES);
            })
            ->get(['id', 'description', 'details']);
        $linked = 0;

        foreach ($actions as $action) {
            if ($this->actionReferencesReason($action, $reason, $titleLower, $titleArLower)) {
                $linked++;
            }
        }

        return [
            'linked_actions_count' => $linked,
        ];
    }

    private function actionReferencesReason(LeadAction $action, NotInterestReason $reason, string $titleLower, string $titleArLower): bool
    {
        $details = $action->details;
        if (!is_array($details)) {
            $details = json_decode((string) $details, true) ?: [];
        }

        if ((int) ($details['not_interest_reason_id'] ?? $details['notInterestReasonId'] ?? 0) === (int) $reason->id) {
            return true;
        }

        $directValues = array_filter([
            $details['notInterestReason'] ?? null,
            $details['not_interest_reason'] ?? null,
            $details['reason'] ?? null,
            $details['reason_text'] ?? null,
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
            if ($kind !== 'not_interest_reason') {
                continue;
            }

            if ((int) ($comment['not_interest_reason_id'] ?? $comment['notInterestReasonId'] ?? $comment['reasonId'] ?? 0) === (int) $reason->id) {
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

    private function updateActionReasonPayload(LeadAction $action, NotInterestReason $oldReason, NotInterestReason $replacement): bool
    {
        $details = $action->details;
        if (!is_array($details)) {
            $details = json_decode((string) $details, true) ?: [];
        }

        $changed = false;
        $replacementText = trim((string) ($replacement->title ?: $replacement->title_ar));
        $oldTitle = trim((string) $oldReason->title);
        $oldTitleAr = trim((string) $oldReason->title_ar);

        foreach (['not_interest_reason_id', 'notInterestReasonId'] as $key) {
            if ((int) ($details[$key] ?? 0) === (int) $oldReason->id) {
                $details[$key] = (int) $replacement->id;
                $changed = true;
            }
        }

        foreach (['notInterestReason', 'not_interest_reason', 'reason', 'reason_text'] as $key) {
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

        if (isset($details['comments']) && is_array($details['comments'])) {
            foreach ($details['comments'] as $index => $comment) {
                if (!is_array($comment)) {
                    continue;
                }

                $kind = strtolower(trim((string) ($comment['kind'] ?? '')));
                if ($kind !== 'not_interest_reason') {
                    continue;
                }

                $commentChanged = false;
                if ((int) ($comment['not_interest_reason_id'] ?? $comment['notInterestReasonId'] ?? $comment['reasonId'] ?? 0) === (int) $oldReason->id) {
                    $details['comments'][$index]['not_interest_reason_id'] = (int) $replacement->id;
                    $details['comments'][$index]['notInterestReasonId'] = (int) $replacement->id;
                    $details['comments'][$index]['reasonId'] = (int) $replacement->id;
                    $commentChanged = true;
                }

                $text = trim((string) ($comment['text'] ?? ''));
                if ($text !== '' && $this->textMatchesReason($text, $oldTitle, $oldTitleAr)) {
                    $details['comments'][$index]['text'] = $replacementText;
                    $commentChanged = true;
                }

                $details['comments'][$index]['reasonTitle'] = $replacement->title;
                $details['comments'][$index]['reasonTitleAr'] = $replacement->title_ar;
                $details['comments'][$index]['notInterestReason'] = $replacement->title;
                $details['comments'][$index]['notInterestReasonAr'] = $replacement->title_ar;
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
}
