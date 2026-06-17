<?php

namespace App\Services;

use App\Models\Lead;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Storage;

class LeadLeakReportService
{
    private const LEAK_LABELS = [
        'speed' => 'First-contact delay',
        'followup' => 'Follow-up process',
        'visibility' => 'Sales visibility',
        'handoff' => 'Lead assignment flow',
        'qualification' => 'Lead qualification',
    ];

    private const RECOMMENDATIONS = [
        'speed' => 'Instant alerts and automatic lead routing',
        'followup' => 'Follow-up reminders and structured cadences',
        'visibility' => 'Live sales dashboards and performance reporting',
        'handoff' => 'Automatic ownership rules and SLA tracking',
        'qualification' => 'Structured intake forms and lead scoring',
    ];

    private const SELLING_POINTS = [
        [
            'title' => 'One operating layer for every lead source',
            'detail' => 'Website forms, campaigns, social leads, WhatsApp, calls, and manual entries can be managed in one CRM flow with source context attached.',
        ],
        [
            'title' => 'Clear ownership and faster response',
            'detail' => 'Assignment, rotation, notifications, and lead status tracking help every enquiry move quickly to the right salesperson.',
        ],
        [
            'title' => 'Follow-up discipline built into daily work',
            'detail' => 'Next actions, comments, call outcomes, reminders, and delay views keep the team from relying on memory or scattered notes.',
        ],
        [
            'title' => 'Management visibility without manual reporting',
            'detail' => 'Dashboards and reports show source performance, pipeline movement, team activity, and delayed leads so managers can act earlier.',
        ],
        [
            'title' => 'Flexible enough for real estate and business teams',
            'detail' => 'Projects, inventory, customers, marketing modules, tasks, users, and custom fields let the CRM match your actual workflow.',
        ],
    ];

    public function generateForLead(Lead $lead, array $diagnostic): string
    {
        $diagnostic = $this->normalizeDiagnostic($diagnostic);
        $topLeaks = array_map(
            fn (string $leak) => [
                'key' => $leak,
                'label' => self::LEAK_LABELS[$leak] ?? str($leak)->replace('_', ' ')->title()->toString(),
                'recommendation' => self::RECOMMENDATIONS[$leak] ?? 'Review this workflow during the tailored CRM demo.',
            ],
            $diagnostic['top_leaks']
        );

        $html = view('reports.lead-leak-detector', [
            'lead' => $lead,
            'diagnostic' => $diagnostic,
            'topLeaks' => $topLeaks,
            'advice' => $diagnostic['advice'],
            'sellingPoints' => self::SELLING_POINTS,
            'generatedAt' => now(),
        ])->render();

        $options = new Options();
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isRemoteEnabled', false);

        $pdf = new Dompdf($options);
        $pdf->loadHtml($html, 'UTF-8');
        $pdf->setPaper('A4');
        $pdf->render();

        $path = sprintf(
            'tenants/%d/leads/%d/attachments/lead-leak-report-%d.pdf',
            $lead->tenant_id,
            $lead->id,
            $lead->id
        );

        Storage::disk('public')->put($path, $pdf->output());

        $attachments = is_array($lead->attachments) ? $lead->attachments : [];
        $attachments = array_values(array_filter(
            $attachments,
            fn ($attachment) => $attachment !== $path
        ));
        $attachments[] = $path;

        $meta = is_array($lead->meta_data) ? $lead->meta_data : [];
        $meta['lead_leak_detector'] = [
            ...$diagnostic,
            'report' => [
                'path' => $path,
                'name' => 'Sales Leakage Audit Report',
                'mime_type' => 'application/pdf',
                'type' => 'diagnostic_report',
                'generated_at' => now()->toIso8601String(),
            ],
        ];

        $lead->forceFill([
            'attachments' => $attachments,
            'meta_data' => $meta,
        ])->save();

        return $path;
    }

    public function normalizeDiagnostic(array $diagnostic): array
    {
        $score = max(0, min(100, (int) ($diagnostic['score'] ?? 0)));
        $riskLevel = strtolower(trim((string) ($diagnostic['risk_level'] ?? '')));
        if (!in_array($riskLevel, ['low', 'medium', 'high'], true)) {
            $riskLevel = $score >= 80 ? 'low' : ($score >= 55 ? 'medium' : 'high');
        }

        $topLeaks = array_values(array_unique(array_filter(
            array_map(
                fn ($value) => strtolower(trim((string) $value)),
                is_array($diagnostic['top_leaks'] ?? null) ? $diagnostic['top_leaks'] : []
            ),
            fn ($value) => $value !== ''
        )));

        return [
            'score' => $score,
            'risk_level' => $riskLevel,
            'top_leaks' => array_slice($topLeaks, 0, 3),
            'answers' => is_array($diagnostic['answers'] ?? null) ? $diagnostic['answers'] : [],
            'advice' => $this->normalizeAdvice($diagnostic),
            'cta_type' => trim((string) ($diagnostic['cta_type'] ?? 'full_report')),
            'source_trigger' => trim((string) ($diagnostic['source_trigger'] ?? 'result_cta')),
            'submitted_at' => now()->toIso8601String(),
        ];
    }

    private function normalizeAdvice(array $diagnostic): array
    {
        $advice = $diagnostic['advice'] ?? null;
        if (is_array($advice) && !empty($advice)) {
            return array_values(array_filter(array_map(function ($item) {
                if (!is_array($item)) {
                    return null;
                }

                return [
                    'title' => trim((string) ($item['title'] ?? 'Recommended sales improvement')),
                    'priority' => trim((string) ($item['priority'] ?? 'High')),
                    'answer' => trim((string) ($item['answer'] ?? 'Based on the audit response')),
                    'impact' => trim((string) ($item['impact'] ?? 'This area can create avoidable leakage when it is not controlled consistently.')),
                    'recommendation' => trim((string) ($item['recommendation'] ?? 'Standardize the workflow and make ownership, next action, and delay visible to managers.')),
                    'beSouholaFit' => trim((string) ($item['beSouholaFit'] ?? 'Be Souhola CRM helps connect intake, follow-up, assignment, and reporting in one workflow.')),
                ];
            }, $advice)));
        }

        $topLeaks = is_array($diagnostic['top_leaks'] ?? null) ? $diagnostic['top_leaks'] : [];
        $fallback = [];
        foreach (array_slice($topLeaks, 0, 4) as $leak) {
            $key = strtolower(trim((string) $leak));
            $fallback[] = [
                'title' => (self::LEAK_LABELS[$key] ?? str($key)->replace('_', ' ')->title()->toString()) . ' needs tighter control',
                'priority' => 'High',
                'answer' => 'Derived from the highest leakage areas',
                'impact' => 'This weakness can slow down sales response, reduce accountability, or make management visibility arrive too late.',
                'recommendation' => self::RECOMMENDATIONS[$key] ?? 'Standardize the workflow and track the next action for every lead.',
                'beSouholaFit' => 'Be Souhola CRM helps turn this workflow into visible, trackable daily execution.',
            ];
        }

        return $fallback;
    }
}
