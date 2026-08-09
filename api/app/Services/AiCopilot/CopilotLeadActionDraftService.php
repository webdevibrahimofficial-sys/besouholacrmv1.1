<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\Stage;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

class CopilotLeadActionDraftService
{
    use UserHierarchyTrait;

    public function build(User $user, array $args): array
    {
        $locale = str_starts_with(strtolower((string) ($args['_locale'] ?? 'en')), 'ar') ? 'ar' : 'en';
        unset($args['_locale']);

        $leadId = (int) ($args['lead_id'] ?? 0);
        $detailsText = trim((string) ($args['details_text'] ?? ''));
        if ($detailsText === '') {
            // Legacy callers may send description as the free-text details.
            $detailsText = trim((string) ($args['raw_details'] ?? ''));
        }

        $stageId = (int) ($args['stage_id'] ?? 0);
        $explicitType = $this->normalizeActionType((string) ($args['type'] ?? $args['action_type'] ?? ''));

        if ($leadId <= 0) {
            return [
                'ok' => true,
                'state' => 'needs_input',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => ['lead_id'],
                'wizard_step' => 'lead',
                'locale' => $locale,
                'payload' => [
                    'lead_id' => null,
                    'details_text' => $detailsText !== '' ? $detailsText : null,
                    'stage_id' => $stageId > 0 ? $stageId : null,
                ],
                'message' => $locale === 'ar'
                    ? 'محتاج رقم الليد أو اسمه عشان نبدأ أكشن. مثال: ابدأ أكشن على الليد 12'
                    : 'I need a lead id or name to start an action. Example: start an action on lead 12',
                'ui_actions' => [],
            ];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'locale' => $locale,
                'message' => $locale === 'ar'
                    ? 'الليد مش موجود أو مش ظاهر لك.'
                    : 'Lead not found or not visible to you.',
                'ui_actions' => [],
            ];
        }

        $leadName = $lead->name ?: ('#'.$lead->id);

        // Step 1: gather what happened on the call/meeting before choosing stage.
        if (! $this->isSufficientActionDetails($detailsText)) {
            $hint = $detailsText !== ''
                ? ($locale === 'ar'
                    ? "محتاج تفاصيل أوضح عن المكالمة/الاجتماع مع العميل (مش اسم المرحلة بس).\n"
                    : "I need clearer details about the call/meeting with the client (not just a stage name).\n")
                : '';

            return [
                'ok' => true,
                'state' => 'awaiting_details',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => ['details_text'],
                'wizard_step' => 'details',
                'locale' => $locale,
                'payload' => [
                    'lead_id' => $lead->id,
                    'details_text' => null,
                    'stage_id' => null,
                ],
                'message' => $locale === 'ar'
                    ? "{$hint}تمام — هنعمل أكشن على {$leadName}.\nاكتب بكلامك إيه اللي حصل بينك وبين العميل: ردّ ولا لأ، مهتم بإيه، في موعد؟ أي اعتراضات؟"
                    : "{$hint}Okay — let's log an action for {$leadName}.\nIn your own words, what happened with the client: did they answer, what are they interested in, any next meeting, any objections?",
                'ui_actions' => [],
            ];
        }

        $stages = $this->selectableStagesForLead($lead);
        if ($stages === []) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'locale' => $locale,
                'message' => $locale === 'ar'
                    ? 'مفيش مراحل متاحة لإضافة أكشن على الليد ده.'
                    : 'No selectable stages are available for this lead.',
                'ui_actions' => [],
            ];
        }

        if ($stageId <= 0) {
            $stageHint = trim((string) ($args['stage_name'] ?? $args['stage'] ?? ''));
            if ($stageHint !== '') {
                $matchedHint = $this->matchStageByHint($stages, $stageHint);
                if ($matchedHint) {
                    $stageId = (int) $matchedHint->id;
                }
            }
        }

        // Step 2: choose / confirm stage (with recommendation from details).
        if ($stageId <= 0) {
            $recommended = $this->recommendStage($stages, $detailsText, $explicitType);
            $stageActions = [];
            foreach ($stages as $index => $stage) {
                if ($index >= 8) {
                    break;
                }
                $label = $this->stageLabel($stage, $locale);
                $isRecommended = $recommended && (int) $recommended->id === (int) $stage->id;
                $stageActions[] = [
                    'type' => 'prompt_message',
                    'message' => '__copilot_action_stage__:'.$stage->id,
                    'display_text' => $label,
                    'label' => $isRecommended
                        ? ($locale === 'ar' ? '★ '.$label.' (مرشّح)' : '★ '.$label.' (recommended)')
                        : $label,
                ];
            }

            $recLabel = $recommended ? $this->stageLabel($recommended, $locale) : null;
            $missedHint = $this->guessMeetingStatus($detailsText) === 'no_show'
                ? ($locale === 'ar'
                    ? "من كلامك باين إن الميتنج السابق ميسد (No Show).\n"
                    : "From your details, the previous meeting looks missed (No Show).\n")
                : '';
            $message = $locale === 'ar'
                ? "فهمت التفاصيل.\n{$missedHint}".($recLabel ? "مرشّح لك مرحلة: {$recLabel}.\n" : '')
                    ."اختار المرحلة المناسبة من الأزرار، أو اكتب اسم المرحلة."
                : "Got the details.\n{$missedHint}".($recLabel ? "Recommended stage: {$recLabel}.\n" : '')
                    .'Pick a stage from the buttons, or type the stage name.';

            return [
                'ok' => true,
                'state' => 'awaiting_stage',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => ['stage_id'],
                'wizard_step' => 'stage',
                'locale' => $locale,
                'recommended_stage_id' => $recommended?->id,
                'recommended_stage_name' => $recLabel,
                'payload' => [
                    'lead_id' => $lead->id,
                    'details_text' => $detailsText,
                    'stage_id' => null,
                ],
                'message' => $message,
                'ui_actions' => $stageActions,
            ];
        }

        $stage = collect($stages)->first(fn ($item) => (int) $item->id === $stageId);
        if (! $stage) {
            $stage = Stage::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('id', $stageId)
                ->first();
        }
        if (! $stage) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => ['stage_id'],
                'locale' => $locale,
                'payload' => [
                    'lead_id' => $lead->id,
                    'details_text' => $detailsText,
                ],
                'message' => $locale === 'ar' ? 'المرحلة دي مش متاحة.' : 'That stage is not available.',
                'ui_actions' => [],
            ];
        }

        $behavior = $this->buildUiBehavior($stage);
        $channelType = $explicitType !== '' && ! in_array($explicitType, ['follow_up', 'متابعة'], true)
            ? $explicitType
            : (string) ($behavior['default_action_type'] ?? 'call');
        if ($channelType === '' || $channelType === 'follow_up') {
            $channelType = 'call';
        }

        $nextActionType = $this->normalizeStageTypeToken((string) ($stage->type ?? $stage->name ?? 'follow_up'));
        $isTerminal = (bool) ($behavior['is_terminal'] ?? false);
        $status = $isTerminal ? 'completed' : 'pending';

        $scheduleSource = trim($detailsText.' '.(string) ($args['schedule_text'] ?? ''));
        $parsedSchedule = $this->extractScheduleFromText($scheduleSource);
        $date = $this->normalizeDate($args['date'] ?? $args['due_date'] ?? $parsedSchedule['date'] ?? null);
        $time = $this->normalizeTime($args['time'] ?? $parsedSchedule['time'] ?? null);

        // Never invent "today" — ask when schedule is required and missing.
        // Meeting stage also requires time (same rule as Add Action / MeetingActionService).
        $needsMeetingTime = str_contains($nextActionType, 'meeting') || $channelType === 'meeting';
        if (
            (($behavior['requires_schedule'] ?? false) && $date === null)
            || ($needsMeetingTime && ($date === null || $time === null))
        ) {
            return [
                'ok' => true,
                'state' => 'awaiting_schedule',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => array_values(array_filter([
                    $date === null ? 'date' : null,
                    ($needsMeetingTime && $time === null) ? 'time' : null,
                ])),
                'wizard_step' => 'schedule',
                'locale' => $locale,
                'payload' => [
                    'lead_id' => $lead->id,
                    'details_text' => $detailsText,
                    'stage_id' => (int) $stage->id,
                    'type' => $channelType,
                    'status' => $status,
                    'description' => $detailsText,
                    'next_action_type' => $nextActionType !== '' ? $nextActionType : null,
                    'date' => $date,
                    'time' => $time,
                ],
                'message' => $locale === 'ar'
                    ? "تمام — المرحلة: {$this->stageLabel($stage, $locale)}.\nامتى المتابعة؟ اكتب التاريخ والوقت (مثال: بكرة الساعة 4 مساءً)."
                    : "Got it — stage: {$this->stageLabel($stage, $locale)}.\nWhen is the next action? Include date and time (e.g. tomorrow at 4:00 pm).",
                'ui_actions' => [
                    [
                        'type' => 'prompt_message',
                        'message' => $locale === 'ar' ? 'بكرة الساعة 4 مساءً' : 'tomorrow at 4:00 pm',
                        'display_text' => $locale === 'ar' ? 'بكرة 4 م' : 'Tomorrow 4pm',
                        'label' => $locale === 'ar' ? 'بكرة 4 م' : 'Tomorrow 4pm',
                    ],
                    [
                        'type' => 'prompt_message',
                        'message' => $locale === 'ar' ? 'اليوم الساعة 5 مساءً' : 'today at 5:00 pm',
                        'display_text' => $locale === 'ar' ? 'اليوم 5 م' : 'Today 5pm',
                        'label' => $locale === 'ar' ? 'اليوم 5 م' : 'Today 5pm',
                    ],
                ],
            ];
        }

        $description = trim((string) ($args['description'] ?? ''));
        if ($description === '') {
            $description = $detailsText;
        }

        $outcome = trim((string) ($args['outcome'] ?? $args['answer_status'] ?? ''));
        if ($outcome === '') {
            $outcome = (string) ($this->guessAnswerOutcome($detailsText) ?? '');
        }
        if ($outcome === '' && ! empty($behavior['auto_answer_status'])) {
            $outcome = (string) $behavior['auto_answer_status'];
        }

        $meetingStatus = trim((string) ($args['meeting_status'] ?? ''));
        if ($meetingStatus === '' && ($needsMeetingTime || str_contains($nextActionType, 'meeting'))) {
            $meetingStatus = (string) ($this->guessMeetingStatus($detailsText) ?? '');
        }

        $payload = array_filter([
            'lead_id' => $lead->id,
            'type' => $channelType,
            'status' => $status,
            'date' => $date,
            'time' => $time,
            'description' => $description !== '' ? $description : null,
            'outcome' => $outcome !== '' ? $outcome : null,
            'meeting_status' => $meetingStatus !== '' ? $meetingStatus : null,
            'stage_id' => (int) $stage->id,
            'next_action_type' => $nextActionType !== '' ? $nextActionType : null,
        ], fn ($value) => $value !== null && $value !== '');

        $wizardPayload = array_merge($payload, [
            'details_text' => $detailsText,
        ]);

        $stageLabel = $this->stageLabel($stage, $locale);

        return [
            'ok' => true,
            'state' => 'awaiting_confirmation',
            'resource' => 'lead_action',
            'requires_confirmation' => true,
            'missing_fields' => [],
            'wizard_step' => 'confirm',
            'locale' => $locale,
            'message' => $this->buildConfirmMessage($lead, $wizardPayload, $stageLabel, $locale),
            'payload' => $wizardPayload,
            'summary' => [
                'lead_id' => $lead->id,
                'lead_name' => $lead->name,
                'stage' => $stageLabel,
                'type' => $channelType,
                'next_action_type' => $nextActionType,
                'status' => $status,
                'date' => $date,
                'time' => $time,
                'outcome' => $outcome !== '' ? $outcome : null,
                'meeting_status' => $meetingStatus !== '' ? $meetingStatus : null,
                'description' => $description !== '' ? $description : null,
            ],
            'ui_actions' => [
                [
                    'type' => 'confirm_action',
                    'action' => 'create_lead_action',
                    'payload' => $payload,
                    'label' => $locale === 'ar' ? 'تأكيد إنشاء الأكشن' : 'Confirm create action',
                ],
                [
                    'type' => 'prompt_message',
                    'message' => '__copilot_action_restart_stage__',
                    'display_text' => $locale === 'ar' ? 'تغيير المرحلة' : 'Change stage',
                    'label' => $locale === 'ar' ? 'تغيير المرحلة' : 'Change stage',
                ],
            ],
        ];
    }

    protected function findVisibleLead(User $user, int $leadId): ?Lead
    {
        if ($leadId <= 0 || ! Schema::hasTable('leads')) {
            return null;
        }

        $query = Lead::query()->where('id', $leadId);
        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id)
                    ->orWhere('assigned_to', $user->id);
            });
        }

        return $query->first();
    }

    /**
     * @return array<int, Stage>
     */
    protected function selectableStagesForLead(Lead $lead): array
    {
        if (! Schema::hasTable('stages')) {
            return [];
        }

        $workflow = strtolower(trim((string) ($lead->workflow_key ?? 'sales')));
        if ($workflow === '') {
            $workflow = 'sales';
        }

        $stages = Stage::query()
            ->where('tenant_id', $lead->tenant_id)
            ->where('is_active', true)
            ->where(function ($query) use ($workflow) {
                $query->where('workflow_key', $workflow)
                    ->orWhereNull('workflow_key');
            })
            ->orderBy('order')
            ->orderBy('id')
            ->get();

        return $stages
            ->filter(function (Stage $stage) {
                $behavior = $this->buildUiBehavior($stage);

                return (bool) ($behavior['selectable_in_add_action'] ?? false);
            })
            ->values()
            ->all();
    }

    protected function recommendStage(array $stages, string $detailsText, string $explicitType = ''): ?Stage
    {
        if ($stages === []) {
            return null;
        }

        $haystack = mb_strtolower($detailsText.' '.$explicitType);
        $ranked = [];

        foreach ($stages as $stage) {
            $score = 0;
            $type = $this->normalizeStageToken((string) ($stage->type ?? ''));
            $name = $this->normalizeStageToken((string) ($stage->name ?? ''));
            $key = $type !== '' ? $type : $name;

            if ($key !== '' && str_contains($haystack, $key)) {
                $score += 5;
            }

            if (preg_match('/(meeting|اجتماع|ميتنج|ميتينج)/u', $haystack) && str_contains($key, 'meeting')) {
                $score += 6;
            }
            // Missed/cancelled meeting still belongs to meeting stage (with meeting_status=no_show).
            if (preg_match('/(no\s*show|missed|ميسد|لم يحضر|meeting\s+cancel|cancel+led?\s+meeting|الميتنج\s+اتلغى)/u', $haystack)
                && str_contains($key, 'meeting')) {
                $score += 8;
            }
            if (preg_match('/(proposal|عرض|بروبوزال)/u', $haystack) && str_contains($key, 'proposal')) {
                $score += 6;
            }
            if (preg_match('/(reserv|حجز|ريزيرف)/u', $haystack) && str_contains($key, 'reservation')) {
                $score += 6;
            }
            if (preg_match('/(clos|عقد|صفقة|closing)/u', $haystack) && str_contains($key, 'closing')) {
                $score += 6;
            }
            // "meeting cancelled" is a missed meeting, not the Cancel lead stage.
            if (
                preg_match('/(cancel|الغاء|إلغاء)/u', $haystack)
                && str_contains($key, 'cancel')
                && ! preg_match('/(meeting|اجتماع|ميتنج).{0,20}(cancel|الغاء|إلغاء)|(cancel|الغاء|إلغاء).{0,20}(meeting|اجتماع)/u', $haystack)
            ) {
                $score += 6;
            }
            if (preg_match('/(not interested|مش مهتم|غير مهتم)/u', $haystack) && str_contains($key, 'not interested')) {
                $score += 6;
            }
            if (preg_match('/(follow|متابع|مكالم|call|whatsapp|واتس)/u', $haystack) && str_contains($key, 'follow')) {
                $score += 4;
            }

            $ranked[] = ['stage' => $stage, 'score' => $score];
        }

        usort($ranked, fn ($a, $b) => $b['score'] <=> $a['score']);
        if (($ranked[0]['score'] ?? 0) > 0) {
            return $ranked[0]['stage'];
        }

        // Prefer a follow_up-like stage when nothing matched.
        foreach ($stages as $stage) {
            $key = $this->normalizeStageToken((string) ($stage->type ?? $stage->name ?? ''));
            if (str_contains($key, 'follow')) {
                return $stage;
            }
        }

        return $stages[0] ?? null;
    }

    /**
     * @param  array<int, Stage>  $stages
     */
    protected function matchStageByHint(array $stages, string $hint): ?Stage
    {
        $needle = $this->normalizeStageToken($hint);
        if ($needle === '') {
            return null;
        }

        foreach ($stages as $stage) {
            $type = $this->normalizeStageToken((string) ($stage->type ?? ''));
            $name = $this->normalizeStageToken((string) ($stage->name ?? ''));
            if ($needle === $type || $needle === $name) {
                return $stage;
            }
        }

        foreach ($stages as $stage) {
            $type = $this->normalizeStageToken((string) ($stage->type ?? ''));
            $name = $this->normalizeStageToken((string) ($stage->name ?? ''));
            if (
                ($type !== '' && (str_contains($type, $needle) || str_contains($needle, $type)))
                || ($name !== '' && (str_contains($name, $needle) || str_contains($needle, $name)))
            ) {
                return $stage;
            }
        }

        return null;
    }

    protected function isSufficientActionDetails(string $detailsText): bool
    {
        $text = trim($detailsText);
        if ($text === '') {
            return false;
        }

        // Stage tokens / short labels are not call details.
        if (mb_strlen($text) < 12) {
            return false;
        }

        $normalized = $this->normalizeStageToken($text);
        $stageLike = [
            'follow', 'follow up', 'follow_up', 'meeting', 'call', 'proposal',
            'reservation', 'cancel', 'not interested', 'new lead', 'cold calls',
            'متابعة', 'اجتماع', 'مكالمة', 'عرض',
        ];
        if (in_array($normalized, $stageLike, true)) {
            return false;
        }

        // Reject canned example templates if they were somehow submitted.
        $examples = [
            'i called the lead, they answered, interested and asked for more details',
            'had an intro meeting, lead is interested and needs follow-up in a week',
            'اتصلت بالعميل ورد، مهتم وطلب تفاصيل أكتر',
            'تم اجتماع تعريفي، العميل مهتم ويحتاج متابعة بعد أسبوع',
        ];
        $lower = mb_strtolower($text);
        foreach ($examples as $example) {
            if ($lower === mb_strtolower($example)) {
                return false;
            }
        }

        return true;
    }

    protected function guessMeetingStatus(string $detailsText): ?string
    {
        $text = mb_strtolower($detailsText);

        if (preg_match('/(no\s*show|noshow|missed\s+meeting|meeting\s+missed|ميسد|لم يحضر|ما جاش|مجاش)/u', $text)) {
            return 'no_show';
        }

        if (preg_match('/(meeting\s+cancel+led?|cancel+led?\s+meeting|الميتنج\s+اتلغى|اجتماع\s+اتلغى|الاجتماع\s+اتلغى)/u', $text)) {
            return 'no_show';
        }

        if (preg_match('/(meeting\s+done|done\s+meeting|تم\s+الاجتماع|حضر\s+الاجتماع)/u', $text)) {
            return 'done';
        }

        return null;
    }

    protected function guessAnswerOutcome(string $detailsText): ?string
    {
        $text = mb_strtolower($detailsText);
        if (preg_match('/(no answer|did\s*n[o\']?t\s*answe?r+e?d?|did\s*not\s*answe?r+e?d?|didnot\s*answe?r+e?d?|مردش|ما رد|لم يرد|لم يردّ|سونج|مش بيرد)/u', $text)) {
            return 'no_answer';
        }
        if (preg_match('/(answered|ردّ?\b|اتكلمنا|كلمته|كلمني)/u', $text)) {
            return 'answer';
        }

        return null;
    }

    protected function meetingStatusLabel(string $status, string $locale): string
    {
        return match ($status) {
            'no_show' => $locale === 'ar' ? 'ميسد (لم يحضر)' : 'Missed (No Show)',
            'done' => $locale === 'ar' ? 'تم الاجتماع' : 'Meeting Done',
            'cancelled' => $locale === 'ar' ? 'ملغى' : 'Cancelled',
            'scheduled' => $locale === 'ar' ? 'مجدول' : 'Scheduled',
            default => $status,
        };
    }

    protected function buildUiBehavior(Stage $stage): array
    {
        $meta = is_array($stage->meta_data ?? null) ? ($stage->meta_data ?? []) : [];
        $type = $this->normalizeStageToken((string) ($stage->type ?? ''));
        $name = $this->normalizeStageToken((string) ($stage->name ?? ''));
        $stageKey = $type !== '' ? $type : $name;
        $displayOnly = (bool) ($meta['display_only'] ?? false);
        $isEntryStage = in_array($stageKey, ['fresh', 'cold calls', 'cold call', 'new lead'], true)
            || in_array((string) ($meta['system_key'] ?? ''), ['sales_new_lead', 'telesales_fresh', 'sales_cold_calls', 'telesales_cold_calls'], true);
        $isTransfer = in_array($stageKey, ['convert', 'transfer', 'transferred'], true);
        $isTerminal = in_array($stageKey, ['closing deals', 'cancel', 'not interested'], true);
        $defaultActionType = in_array($stageKey, ['proposal', 'reservation', 'closing deals', 'rent', 'meeting'], true)
            ? str_replace(' ', '_', $stageKey)
            : ($stageKey === 'cancel' ? 'cancel' : 'call');

        return [
            'stage_key' => str_replace(' ', '_', $stageKey),
            'display_only' => $displayOnly,
            'selectable_in_add_action' => ! $displayOnly && ! $isEntryStage,
            'is_transfer' => $isTransfer,
            'is_terminal' => $isTerminal,
            'requires_schedule' => ! $displayOnly && ! $isTransfer && ! $isTerminal,
            'requires_answer_toggle' => ! $displayOnly && ! $isTransfer && ! in_array($stageKey, ['cancel', 'not interested'], true),
            'comment_required' => ! in_array($stageKey, ['cancel', 'not interested'], true),
            'default_action_type' => $defaultActionType,
            'auto_answer_status' => match ($stageKey) {
                'cancel' => 'cancelled',
                'not interested' => 'answer',
                default => null,
            },
        ];
    }

    protected function stageLabel(Stage $stage, string $locale): string
    {
        if ($locale === 'ar') {
            $ar = trim((string) ($stage->name_ar ?? ''));
            if ($ar !== '') {
                return $ar;
            }
        }

        return trim((string) ($stage->name ?? ('Stage #'.$stage->id)));
    }

    protected function normalizeStageToken(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['_', '-'], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    protected function normalizeStageTypeToken(string $value): string
    {
        $value = $this->normalizeStageToken($value);

        return str_replace(' ', '_', $value);
    }

    protected function normalizeActionType(string $value): string
    {
        $value = strtolower(trim($value));

        return match ($value) {
            'followup', 'follow-up', 'follow up', 'follow_up', 'متابعة' => 'follow_up',
            'meeting', 'meeting_arrange', 'arrange_meeting', 'اجتماع' => 'meeting',
            'comment', 'تعليق' => 'comment',
            'note', 'ملاحظة' => 'note',
            'internal_comment', 'internal comment' => 'internal_comment',
            'call', 'مكالمة' => 'call',
            'whatsapp', 'واتس', 'واتساب' => 'whatsapp',
            default => $value,
        };
    }

    protected function extractScheduleFromText(string $text): array
    {
        $date = null;
        $time = null;
        $raw = trim($text);
        if ($raw === '') {
            return ['date' => null, 'time' => null];
        }

        $lower = mb_strtolower($raw);

        if (preg_match('/\btomorrow\b/u', $lower) || preg_match('/بكرة|بكرا|غداً?|غدا/u', $raw)) {
            $date = now()->addDay()->toDateString();
        } elseif (preg_match('/\btoday\b/u', $lower) || preg_match('/\bاليوم\b/u', $raw)) {
            $date = now()->toDateString();
        } elseif (preg_match('/\bnext\s+week\b/u', $lower) || preg_match('/الأسبوع\s+القادم|الاسبوع\s+القادم/u', $raw)) {
            $date = now()->addWeek()->toDateString();
        } elseif (preg_match('/(?:after|in)\s+(\d+)\s+days?/u', $lower, $match) || preg_match('/بعد\s+(\d+)\s*(?:يوم|أيام|ايام)/u', $raw, $match)) {
            $date = now()->addDays(max(1, (int) $match[1]))->toDateString();
        } elseif (preg_match('/(\d{4}-\d{2}-\d{2})/u', $raw, $match)) {
            $date = $match[1];
        } elseif (preg_match('/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/u', $raw, $match)) {
            $day = (int) $match[1];
            $month = (int) $match[2];
            $year = (int) $match[3];
            if ($day <= 12 && $month > 12) {
                [$day, $month] = [$month, $day];
            }
            if ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) {
                $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
            }
        }

        if (preg_match('/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/iu', $raw, $match)) {
            $hour = (int) $match[1];
            $minute = isset($match[2]) && $match[2] !== '' ? (int) $match[2] : 0;
            $meridiem = strtolower((string) $match[3]);
            if ($meridiem === 'pm' && $hour < 12) {
                $hour += 12;
            }
            if ($meridiem === 'am' && $hour === 12) {
                $hour = 0;
            }
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                $time = sprintf('%02d:%02d', $hour, $minute);
            }
        } elseif (preg_match('/الساعة\s*(\d{1,2})(?::(\d{2}))?\s*(صباحاً?|مساءً?|ص|م)?/u', $raw, $match)) {
            $hour = (int) $match[1];
            $minute = isset($match[2]) && $match[2] !== '' ? (int) $match[2] : 0;
            $meridiem = trim((string) ($match[3] ?? ''));
            if (in_array($meridiem, ['مساء', 'مساءً', 'م'], true) && $hour < 12) {
                $hour += 12;
            }
            if (in_array($meridiem, ['صباحا', 'صباحاً', 'ص'], true) && $hour === 12) {
                $hour = 0;
            }
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                $time = sprintf('%02d:%02d', $hour, $minute);
            }
        } elseif (preg_match('/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/u', $raw, $match)) {
            $hour = (int) $match[1];
            $minute = (int) $match[2];
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                $time = sprintf('%02d:%02d', $hour, $minute);
            }
        }

        return ['date' => $date, 'time' => $time];
    }

    protected function normalizeDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = trim((string) $value);
        $lower = strtolower($raw);

        if (in_array($lower, ['today', 'اليوم'], true)) {
            return now()->toDateString();
        }

        if (in_array($lower, ['tomorrow', 'بكرة', 'غدا', 'غداً', 'بكرا'], true)) {
            return now()->addDay()->toDateString();
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw)) {
            return $raw;
        }

        try {
            return Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    protected function normalizeTime(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = trim((string) $value);
        try {
            return Carbon::parse($raw)->format('H:i');
        } catch (\Throwable) {
            return $raw;
        }
    }

    protected function buildConfirmMessage(Lead $lead, array $payload, string $stageLabel, string $locale): string
    {
        $leadName = $lead->name ?: ('#'.$lead->id);
        if ($locale === 'ar') {
            $lines = [
                "مسودة الأكشن جاهزة لـ {$leadName}.",
                'المرحلة: '.$stageLabel,
                'القناة: '.str_replace('_', ' ', (string) ($payload['type'] ?? '')),
            ];
            if (! empty($payload['meeting_status'])) {
                $lines[] = 'نتيجة الميتنج: '.$this->meetingStatusLabel((string) $payload['meeting_status'], 'ar');
            }
            if (! empty($payload['date'])) {
                $lines[] = 'موعد المتابعة: '.$payload['date'].(! empty($payload['time']) ? ' '.$payload['time'] : '');
            }
            if (! empty($payload['outcome'])) {
                $lines[] = 'نتيجة الرد: '.$payload['outcome'];
            }
            $lines[] = 'الكومنت: '.(string) ($payload['description'] ?? '');
            $lines[] = 'أكّد عشان أنشئ الأكشن.';

            return implode("\n", $lines);
        }

        $lines = [
            "Action draft ready for {$leadName}.",
            'Stage: '.$stageLabel,
            'Channel: '.str_replace('_', ' ', (string) ($payload['type'] ?? '')),
        ];
        if (! empty($payload['meeting_status'])) {
            $lines[] = 'Meeting result: '.$this->meetingStatusLabel((string) $payload['meeting_status'], 'en');
        }
        if (! empty($payload['date'])) {
            $lines[] = 'Next action: '.$payload['date'].(! empty($payload['time']) ? ' '.$payload['time'] : '');
        }
        if (! empty($payload['outcome'])) {
            $lines[] = 'Answer outcome: '.$payload['outcome'];
        }
        $lines[] = 'Comment: '.(string) ($payload['description'] ?? '');
        $lines[] = 'Confirm to create it.';

        return implode("\n", $lines);
    }
}
