<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sales Leakage Audit Report</title>
    <style>
        @page { margin: 34px; }
        body { color: #172033; font-family: "DejaVu Sans", sans-serif; font-size: 12px; line-height: 1.55; }
        h1, h2, p { margin: 0; }
        h1 { font-size: 25px; color: #111827; }
        h2 { margin-bottom: 10px; font-size: 15px; color: #111827; }
        .muted { color: #64748b; }
        .header { border-bottom: 3px solid #7c3aed; margin-bottom: 22px; padding-bottom: 16px; }
        .brand { color: #7c3aed; font-size: 11px; font-weight: bold; letter-spacing: 1.5px; }
        .grid { width: 100%; border-collapse: separate; border-spacing: 10px; margin: 0 -10px 18px; }
        .grid td { vertical-align: top; width: 50%; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
        .score { color: #7c3aed; font-size: 32px; font-weight: bold; }
        .risk { background: #ede9fe; border-radius: 12px; color: #5b21b6; display: inline-block; font-size: 10px; font-weight: bold; margin-top: 6px; padding: 4px 9px; text-transform: uppercase; }
        .section { margin-top: 20px; }
        .leak { border-left: 4px solid #8b5cf6; margin-bottom: 9px; padding: 8px 10px; }
        .advice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; padding: 12px; }
        .priority { background: #ecfeff; border-radius: 12px; color: #0f766e; display: inline-block; font-size: 9px; font-weight: bold; margin-left: 6px; padding: 3px 7px; text-transform: uppercase; }
        .selling-grid { width: 100%; border-collapse: separate; border-spacing: 8px; margin: 0 -8px; }
        .selling-grid td { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 11px; vertical-align: top; width: 50%; }
        .footer { border-top: 1px solid #e2e8f0; color: #64748b; font-size: 9px; margin-top: 24px; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">BE SOUHOLA CRM</div>
        <h1>Sales Leakage Audit Report</h1>
        <p class="muted">Generated automatically from the Lead Leak Detector.</p>
    </div>

    <table class="grid">
        <tr>
            <td>
                <div class="card">
                    <h2>Lead Information</h2>
                    <p><strong>Name:</strong> {{ $lead->name ?: '-' }}</p>
                    <p><strong>Phone:</strong> {{ $lead->phone ?: '-' }}</p>
                    <p><strong>Email:</strong> {{ $lead->email ?: '-' }}</p>
                    <p><strong>Company:</strong> {{ data_get($lead->meta_data, 'payload_meta.company_name', '-') ?: '-' }}</p>
                    <p><strong>Submitted:</strong> {{ $generatedAt->format('Y-m-d H:i') }}</p>
                </div>
            </td>
            <td>
                <div class="card">
                    <h2>Diagnostic Result</h2>
                    <div class="score">{{ $diagnostic['score'] }}/100</div>
                    <div class="risk">{{ $diagnostic['risk_level'] }} risk</div>
                    <p style="margin-top: 10px;"><strong>Request:</strong> {{ str_replace('_', ' ', $diagnostic['cta_type']) }}</p>
                </div>
            </td>
        </tr>
    </table>

    <div class="section">
        <h2>Top Leakage Points and Recommended Fixes</h2>
        @forelse ($topLeaks as $index => $leak)
            <div class="leak">
                <strong>{{ $index + 1 }}. {{ $leak['label'] }}</strong><br>
                <span class="muted">Be Souhola focus: {{ $leak['recommendation'] }}</span>
            </div>
        @empty
            <p class="muted">No specific leakage points were recorded.</p>
        @endforelse
    </div>

    <div class="section">
        <h2>Personalized Recommendations Based on the Client's Responses</h2>
        @forelse ($advice as $item)
            <div class="advice">
                <strong>{{ $item['title'] }}</strong>
                <span class="priority">{{ $item['priority'] }}</span>
                <p class="muted" style="margin-top: 4px;">Based on: {{ $item['answer'] }}</p>
                <p style="margin-top: 7px;"><strong>Business impact:</strong> {{ $item['impact'] }}</p>
                <p style="margin-top: 7px;"><strong>Recommended action:</strong> {{ $item['recommendation'] }}</p>
                <p style="margin-top: 7px;"><strong>How Be Souhola helps:</strong> {{ $item['beSouholaFit'] }}</p>
            </div>
        @empty
            <p class="muted">No personalized recommendations were recorded.</p>
        @endforelse
    </div>

    <div class="section">
        <h2>Why Be Souhola Is a Strong Fit</h2>
        <table class="selling-grid">
            @foreach (array_chunk($sellingPoints, 2) as $row)
                <tr>
                    @foreach ($row as $point)
                        <td>
                            <strong>{{ $point['title'] }}</strong>
                            <p class="muted" style="margin-top: 5px;">{{ $point['detail'] }}</p>
                        </td>
                    @endforeach
                    @if (count($row) === 1)
                        <td></td>
                    @endif
                </tr>
            @endforeach
        </table>
    </div>

    <div class="footer">
        Lead #{{ $lead->id }} | Tenant #{{ $lead->tenant_id }} | Generated {{ $generatedAt->toIso8601String() }}
    </div>
</body>
</html>
