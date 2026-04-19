<?php

namespace App\Services;

use App\Models\CcContract;
use App\Models\ContractTemplate;
use App\Models\SmtpSetting;
use App\Models\Tenant;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\View;

class ContractTemplateRenderService
{
    public function pickTemplate(int $tenantId, int $projectId = 0): ?ContractTemplate
    {
        return ContractTemplate::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'Active')
            ->where('content_type', 'html')
            ->when($projectId > 0, fn ($q) => $q->where(function ($sub) use ($projectId) {
                $sub->where('project_id', $projectId)->orWhereNull('project_id');
            }), fn ($q) => $q->whereNull('project_id'))
            ->orderByRaw('CASE WHEN project_id IS NULL THEN 1 ELSE 0 END') // prefer matching project first
            ->latest('id')
            ->first();
    }

    public function buildPrintPayload(int $tenantId, CcContract $contract): array
    {
        $tenant = Tenant::find($tenantId);
        $profile = is_array($tenant?->profile) ? $tenant->profile : [];
        $smtp = SmtpSetting::where('tenant_id', $tenantId)->first();

        $tenantName = (string) ($tenant?->name ?? 'Tenant');
        $logoUrl = (string) ($profile['logo_url'] ?? '');
        $phone = (string) ($profile['phone'] ?? '');
        $taxId = (string) ($profile['tax_id'] ?? '');
        $email = (string) ($smtp?->from_email ?? '');

        $projectId = (int) ($contract->customer?->project_id ?? 0);
        $template = $this->pickTemplate($tenantId, $projectId);

        $rawBody = (string) ($template?->body ?? '');
        if (trim($rawBody) === '') {
            $rawBody = $this->defaultBodyHtml();
        }

        $paymentPlanTable = $this->renderPaymentPlanTable($contract);
        $installmentsTable = $this->renderInstallmentsTableSnapshot($contract);

        $replacements = [
            'contract_number' => ['type' => 'text', 'value' => (string) ($contract->contract_number ?: $contract->id)],
            'contract_date' => ['type' => 'text', 'value' => (string) ($contract->contract_date?->toDateString() ?? '')],
            'customer_name' => ['type' => 'text', 'value' => (string) ($contract->customer?->name ?? '')],
            'customer_phone' => ['type' => 'text', 'value' => (string) ($contract->customer?->phone ?? '')],
            'unit_code' => ['type' => 'text', 'value' => (string) ($contract->property?->unit_code ?? '')],
            'project_name' => ['type' => 'text', 'value' => (string) ($contract->customer?->project?->name ?? '')],
            'total_price' => ['type' => 'text', 'value' => number_format((float) ($contract->total_price ?? 0), 2)],
            'payment_plan_table' => ['type' => 'html', 'value' => $paymentPlanTable],
            'installments_table' => ['type' => 'html', 'value' => $installmentsTable],
        ];

        $bodyHtml = $this->replaceAllowlistedPlaceholders($rawBody, $replacements);
        $bodyHtml = $this->stripScripts($bodyHtml);
        $bodyHtml = $this->stripUnknownPlaceholders($bodyHtml);

        return [
            'tenant' => [
                'name' => $tenantName,
                'logo_url' => $logoUrl,
                'phone' => $phone,
                'email' => $email,
                'tax_id' => $taxId,
            ],
            'contract' => $contract,
            'template' => $template,
            'body_html' => $bodyHtml,
        ];
    }

    public function renderPaymentPlanTable(CcContract $contract): string
    {
        $snap = is_array($contract->payment_plan_snapshot) ? $contract->payment_plan_snapshot : [];

        return $this->renderViewIfExists('cc.contracts.partials.payment_plan_table', [
            'reservation_amount' => (float) Arr::get($snap, 'reservation_amount', 0),
            'down_payment' => (float) Arr::get($snap, 'down_payment', 0),
            'delivery_payment' => (float) Arr::get($snap, 'delivery_payment', 0),
            'installment_type' => (string) Arr::get($snap, 'installment_type', ''),
            'installment_count' => (int) Arr::get($snap, 'installment_count', 0),
            'installment_value' => (float) Arr::get($snap, 'installment_value', 0),
        ]);
    }

    public function renderInstallmentsTableSnapshot(CcContract $contract): string
    {
        $items = $contract->installments ?? collect();

        return $this->renderViewIfExists('cc.contracts.partials.installments_table', [
            'installments' => $items,
            'show_status' => false,
            'show_paid' => false,
        ]);
    }

    protected function renderViewIfExists(string $view, array $data): string
    {
        if (!View::exists($view)) {
            // Safe minimal fallback if views are missing.
            return $this->renderTableFallback($data);
        }

        return (string) view($view, $data)->render();
    }

    protected function renderTableFallback(array $data): string
    {
        // Extremely small fallback (should not be used once views exist).
        $html = '<div style="color:#6b7280;font-size:13px">Template table view missing.</div>';

        return $html;
    }

    protected function replaceAllowlistedPlaceholders(string $html, array $replacements): string
    {
        foreach ($replacements as $key => $payload) {
            $pattern = '/\{\{\s*' . preg_quote((string) $key, '/') . '\s*\}\}/i';
            $type = (string) ($payload['type'] ?? 'text');
            $value = (string) ($payload['value'] ?? '');

            if ($type !== 'html') {
                $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
            }

            $html = preg_replace($pattern, $value, $html) ?? $html;
        }

        return $html;
    }

    protected function stripUnknownPlaceholders(string $html): string
    {
        // Remove any remaining {{...}} tokens (unknown placeholders).
        return preg_replace('/\{\{[^}]*\}\}/', '', $html) ?? $html;
    }

    protected function stripScripts(string $html): string
    {
        return preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html) ?? $html;
    }

    public function defaultBodyHtml(): string
    {
        return '<div class="section"><h2 style="text-align:center;margin-bottom:12px">Contract</h2>'
            . '<p><strong>Contract No.:</strong> {{contract_number}}</p>'
            . '<p><strong>Contract Date:</strong> {{contract_date}}</p>'
            . '<p><strong>Customer:</strong> {{customer_name}} <span class="muted" dir="ltr">{{customer_phone}}</span></p>'
            . '<p><strong>Project:</strong> {{project_name}}</p>'
            . '<p><strong>Unit Code:</strong> {{unit_code}}</p>'
            . '<p><strong>Total Price:</strong> {{total_price}}</p>'
            . '</div>'
            . '<div class="section"><h3>Payment Plan</h3>{{payment_plan_table}}</div>'
            . '<div class="section"><h3>Installments</h3>{{installments_table}}</div>'
            . '<div class="section" style="margin-top:22px;display:flex;gap:24px;justify-content:space-between">'
            . '<div style="flex:1"><div style="font-weight:700;margin-bottom:6px">Seller</div><div>Signature: __________________</div></div>'
            . '<div style="flex:1"><div style="font-weight:700;margin-bottom:6px">Buyer</div><div>Signature: __________________</div></div>'
            . '</div>';
    }
}

