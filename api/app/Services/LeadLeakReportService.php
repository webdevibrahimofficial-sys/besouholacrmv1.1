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
            'cta_type' => trim((string) ($diagnostic['cta_type'] ?? 'full_report')),
            'source_trigger' => trim((string) ($diagnostic['source_trigger'] ?? 'result_cta')),
            'submitted_at' => now()->toIso8601String(),
        ];
    }
}
