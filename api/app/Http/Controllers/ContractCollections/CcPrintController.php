<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcContract;
use App\Models\CcPayment;
use App\Models\CcPaymentAllocation;
use App\Models\SmtpSetting;
use App\Models\Tenant;
use App\Services\ContractTemplateRenderService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CcPrintController extends BaseCcController
{
    public function __construct(protected ContractTemplateRenderService $renderer)
    {
    }

    public function printContract(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $contract = CcContract::where('tenant_id', $tenantId)->with([
            'customer',
            'customer.project:id,name',
            'property',
            'installments' => fn ($q) => $q->orderBy('installment_number'),
        ])->findOrFail($id);

        $isRtl = filter_var($request->query('rtl', null), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($isRtl === null) {
            $accept = strtolower((string) $request->header('Accept-Language', ''));
            $isRtl = Str::startsWith($accept, 'ar') || app()->getLocale() === 'ar';
        }

        $autoprint = filter_var($request->query('autoprint', false), FILTER_VALIDATE_BOOLEAN);
        $embed = filter_var($request->query('embed', false), FILTER_VALIDATE_BOOLEAN);
        $payload = $this->renderer->buildPrintPayload($tenantId, $contract);

        return response()
            ->view('cc.contracts.print', [
                'tenant' => $payload['tenant'],
                'contractNumber' => (string) ($contract->contract_number ?: $contract->id),
                'contractDate' => (string) ($contract->contract_date?->toDateString() ?? ''),
                'bodyHtml' => (string) ($payload['body_html'] ?? ''),
                'dir' => $isRtl ? 'rtl' : 'ltr',
                'autoprint' => $autoprint,
                'embed' => $embed,
            ])
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }

    public function printReceipt(Request $request, int $paymentId)
    {
        $this->requireCcPermission($request, 'viewInstallments');

        $tenantId = $this->tenantId($request);
        $payment = CcPayment::where('tenant_id', $tenantId)
            ->with([
                'customer',
                'contract.customer.project:id,name',
                'contract.property',
                'allocations.installment',
            ])
            ->findOrFail($paymentId);

        $tenant = Tenant::find($tenantId);
        $profile = is_array($tenant?->profile) ? $tenant->profile : [];
        $smtp = SmtpSetting::where('tenant_id', $tenantId)->first();

        $tenantName = (string) ($tenant?->name ?? 'Tenant');
        $logoUrl = (string) ($profile['logo_url'] ?? '');
        $phone = (string) ($profile['phone'] ?? '');
        $taxId = (string) ($profile['tax_id'] ?? '');
        $email = (string) ($smtp?->from_email ?? '');

        $receiptNo = 'RCPT-' . $payment->id;
        $paymentDate = $payment->payment_date ? $payment->payment_date->toDateString() : '';
        $method = (string) ($payment->payment_method ?? '');
        $reference = (string) ($payment->reference_number ?? '');

        $customerName = (string) ($payment->customer?->name ?? '');
        $customerPhone = (string) ($payment->customer?->phone ?? '');
        $contractNo = (string) ($payment->contract?->contract_number ?? $payment->contract_id ?? '');
        $unitCode = (string) ($payment->contract?->property?->unit_code ?? '');
        $projectName = (string) ($payment->contract?->customer?->project?->name ?? '');

        $allocRows = $payment->allocations ?? collect();
        $allocHtml = '';
        foreach ($allocRows as $alloc) {
            $instNo = $alloc?->installment?->installment_number;
            $due = $alloc?->installment?->due_date?->toDateString() ?? '';
            $amt = (float) ($alloc?->amount_applied ?? 0);
            $allocHtml .= '<tr>'
                . '<td>#' . htmlspecialchars((string) ($instNo ?? ''), ENT_QUOTES, 'UTF-8') . '</td>'
                . '<td>' . htmlspecialchars((string) $due, ENT_QUOTES, 'UTF-8') . '</td>'
                . '<td style="text-align:right">' . number_format($amt, 2) . '</td>'
                . '</tr>';
        }
        if ($allocHtml === '') {
            $allocHtml = '<tr><td colspan="3" style="color:#6b7280">No allocations</td></tr>';
        }

        $autoprint = filter_var($request->query('autoprint', false), FILTER_VALIDATE_BOOLEAN);

        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8" />'
            . '<meta name="viewport" content="width=device-width, initial-scale=1" />'
            . '<title>Receipt ' . htmlspecialchars($receiptNo, ENT_QUOTES, 'UTF-8') . '</title>'
            . '<style>
              :root { --muted:#6b7280; --border:#e5e7eb; --text:#111827; }
              *{box-sizing:border-box}
              body{margin:0;font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:var(--text); background:#f3f4f6;}
              .page{max-width:900px;margin:24px auto;padding:0 12px;}
              .card{background:#fff;border:1px solid var(--border);border-radius:16px;overflow:hidden;}
              .hdr,.ftr{padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
              .hdr{border-bottom:1px solid var(--border);}
              .ftr{border-top:1px solid var(--border);font-size:12px;color:var(--muted);flex-wrap:wrap}
              .logo{height:40px;object-fit:contain}
              .title{font-size:18px;font-weight:700;margin:0}
              .muted{color:var(--muted)}
              .content{padding:22px 24px;}
              .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
              .box{border:1px solid var(--border);border-radius:12px;padding:12px;}
              .box .k{font-size:12px;color:var(--muted)}
              .box .v{font-size:14px;font-weight:600;margin-top:4px;word-break:break-word}
              table{width:100%;border-collapse:collapse;margin-top:12px}
              th,td{border-top:1px solid var(--border);padding:10px 8px;font-size:13px;text-align:left}
              th{background:#f9fafb;font-size:12px;color:var(--muted);border-top:none}
              .actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}
              .btn{border:1px solid var(--border);background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:13px}
              .btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
              @media print{
                body{background:#fff}
                .page{margin:0;max-width:none;padding:0}
                .actions{display:none}
                .card{border:none;border-radius:0}
              }
              @page { size: A4; margin: 12mm; }
            </style></head><body>'
            . '<div class="page"><div class="actions">'
            . '<button class="btn" onclick="window.close()">Close</button>'
            . '<button class="btn primary" onclick="window.print()">Print / Save PDF</button>'
            . '</div>'
            . '<div class="card">'
            . '<div class="hdr">'
            . '<div style="display:flex;align-items:center;gap:12px;min-width:0;">'
            . ($logoUrl ? '<img class="logo" src="' . htmlspecialchars($logoUrl, ENT_QUOTES, 'UTF-8') . '" alt="Logo" />' : '')
            . '<div style="min-width:0">'
            . '<div class="title">' . htmlspecialchars($tenantName, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div class="muted" style="font-size:12px;">Payment Receipt</div>'
            . '</div></div>'
            . '<div style="text-align:right">'
            . '<div style="font-weight:700">' . htmlspecialchars($receiptNo, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div class="muted" style="font-size:12px;">' . htmlspecialchars($paymentDate, ENT_QUOTES, 'UTF-8') . '</div>'
            . '</div>'
            . '</div>'
            . '<div class="content">'
            . '<div class="grid">'
            . '<div class="box"><div class="k">Customer</div><div class="v">' . htmlspecialchars($customerName, ENT_QUOTES, 'UTF-8') . '</div><div class="muted" style="font-size:12px;margin-top:4px" dir="ltr">' . htmlspecialchars($customerPhone, ENT_QUOTES, 'UTF-8') . '</div></div>'
            . '<div class="box"><div class="k">Contract / Unit</div><div class="v">' . htmlspecialchars($contractNo, ENT_QUOTES, 'UTF-8') . '</div><div class="muted" style="font-size:12px;margin-top:4px">' . htmlspecialchars($unitCode, ENT_QUOTES, 'UTF-8') . '</div></div>'
            . '<div class="box"><div class="k">Project</div><div class="v">' . htmlspecialchars($projectName, ENT_QUOTES, 'UTF-8') . '</div></div>'
            . '<div class="box"><div class="k">Method</div><div class="v">' . htmlspecialchars($method, ENT_QUOTES, 'UTF-8') . '</div></div>'
            . '<div class="box"><div class="k">Reference / Check No.</div><div class="v">' . htmlspecialchars($reference, ENT_QUOTES, 'UTF-8') . '</div></div>'
            . '<div class="box"><div class="k">Amount</div><div class="v">' . number_format((float) $payment->amount, 2) . '</div></div>'
            . '</div>'
            . '<div style="margin-top:14px;font-weight:700">Allocations</div>'
            . '<table><thead><tr><th>Installment</th><th>Due Date</th><th style="text-align:right">Applied</th></tr></thead><tbody>'
            . $allocHtml
            . '</tbody></table>'
            . '</div>'
            . '<div class="ftr">'
            . '<div>Phone: ' . htmlspecialchars($phone ?: '-', ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div>Email: ' . htmlspecialchars($email ?: '-', ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div>Tax ID: ' . htmlspecialchars($taxId ?: '-', ENT_QUOTES, 'UTF-8') . '</div>'
            . '</div>'
            . '</div></div>'
            . ($autoprint ? '<script>setTimeout(()=>window.print(),400);</script>' : '')
            . '</body></html>';

        return response($html)->header('Content-Type', 'text/html; charset=UTF-8');
    }

    public function printInstallmentReceipt(Request $request, int $installmentId)
    {
        $this->requireCcPermission($request, 'viewInstallments');

        $tenantId = $this->tenantId($request);

        $paymentId = (int) CcPaymentAllocation::query()
            ->from('cc_payment_allocations as a')
            ->join('cc_payments as p', function ($join) use ($tenantId) {
                $join->on('p.id', '=', 'a.payment_id')->where('p.tenant_id', '=', $tenantId);
            })
            ->where('a.tenant_id', $tenantId)
            ->where('a.installment_id', $installmentId)
            ->orderByDesc('p.payment_date')
            ->orderByDesc('p.id')
            ->value('a.payment_id');

        if (!$paymentId) {
            abort(404, 'No receipt available');
        }

        return $this->printReceipt($request, $paymentId);
    }

    // Receipt printing remains implemented here (separate document type).
}
