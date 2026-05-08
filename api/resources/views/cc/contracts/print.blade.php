@php
  $tenant = $tenant ?? [];
  $tenantName = (string) ($tenant['name'] ?? 'Tenant');
  $logoUrl = (string) ($tenant['logo_url'] ?? '');
  $phone = (string) ($tenant['phone'] ?? '');
  $email = (string) ($tenant['email'] ?? '');
  $taxId = (string) ($tenant['tax_id'] ?? '');
  $contractNumber = (string) ($contractNumber ?? '');
  $contractDate = (string) ($contractDate ?? '');
  $bodyHtml = (string) ($bodyHtml ?? '');
  $dir = (string) ($dir ?? 'ltr');
  $autoprint = (bool) ($autoprint ?? false);
  $embed = (bool) ($embed ?? false);
@endphp

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Contract {{ $contractNumber }}</title>
    <style>
      :root { --muted:#6b7280; --border:#e5e7eb; --text:#111827; --bg:#f3f4f6; }
      *{box-sizing:border-box}
      body{margin:0;font-family:"Times New Roman", Times, serif; color:var(--text); background:var(--bg);}
      .page{max-width:900px;margin:24px auto;padding:0 12px;}
      .actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}
      .btn{border:1px solid var(--border);background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:13px}
      .btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
      .card{background:#fff;border:1px solid var(--border);border-radius:16px;overflow:hidden;}
      .hdr{padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
      .hdr{border-bottom:1px solid var(--border);}
      .logo{height:40px;object-fit:contain}
      .tenant{font-size:18px;font-weight:700;margin:0}
      .muted{color:var(--muted)}
      .content{padding:22px 24px;}
      .content h1,.content h2,.content h3{margin:0 0 8px 0}
      .content p{margin:0 0 8px 0;line-height:1.5}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid var(--border);padding:8px 10px;font-size:13px;vertical-align:top}
      th{background:#f9fafb;font-size:12px;color:var(--muted);text-align:left}
      .section{margin-top:14px}
      .sign-footer{display:none}
      @media print{
        body{background:#fff}
        .page{margin:0;max-width:none;padding:0}
        .actions{display:none}
        .card{border:none;border-radius:0}
        .content{padding-bottom:42mm}
        .sign-footer{
          display:block;
          position:fixed;
          left:12mm;
          right:12mm;
          bottom:10mm;
          border-top:1px solid var(--border);
          padding-top:6mm;
          font-size:11px;
          color:var(--text);
          background:#fff;
        }
        .sign-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10mm 12mm}
        .sign-title{font-weight:700;margin-bottom:2mm}
        .sign-line{display:flex;gap:8px;align-items:flex-end}
        .sign-line span.label{color:var(--muted);min-width:64px}
        .sign-line span.line{flex:1;border-bottom:1px solid #9ca3af;height:12px}
      }
      @page { size: A4; margin: 12mm; }
    </style>
  </head>
  <body>
    <div class="page" dir="{{ $dir }}">
      @if(!$embed)
        <div class="actions">
          <button class="btn" onclick="window.close()">Close</button>
          <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
        </div>
      @endif

      <div class="card">
        <div class="hdr">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
            @if($logoUrl)
              <img class="logo" src="{{ $logoUrl }}" alt="Logo" />
            @endif
            <div style="min-width:0">
              <div class="tenant">{{ $tenantName }}</div>
              <div class="muted" style="font-size:12px;">Contract</div>
            </div>
          </div>

          <div style="text-align:{{ $dir === 'rtl' ? 'left' : 'right' }}; font-size:12px;">
            <div style="font-weight:700">{{ $contractNumber }}</div>
            <div class="muted" style="font-size:12px;">{{ $contractDate }}</div>
            <div class="muted" style="margin-top:6px;">
              <div><span style="color:var(--muted)">Phone:</span> {{ $phone ?: '-' }}</div>
              <div><span style="color:var(--muted)">Email:</span> {{ $email ?: '-' }}</div>
              <div><span style="color:var(--muted)">Tax No.:</span> {{ $taxId ?: '-' }}</div>
            </div>
          </div>
        </div>

        <div class="content">{!! $bodyHtml !!}</div>
      </div>
    </div>

    <div class="sign-footer">
      <div class="sign-grid">
        <div>
          <div class="sign-title">Seller</div>
          <div class="sign-line"><span class="label">Signature</span><span class="line"></span></div>
        </div>
        <div>
          <div class="sign-title">Buyer</div>
          <div class="sign-line"><span class="label">Signature</span><span class="line"></span></div>
        </div>
        <div>
          <div class="sign-title">Witness 1</div>
          <div class="sign-line"><span class="label">Signature</span><span class="line"></span></div>
        </div>
        <div>
          <div class="sign-title">Witness 2</div>
          <div class="sign-line"><span class="label">Signature</span><span class="line"></span></div>
        </div>
      </div>
    </div>

    @if($autoprint)
      <script>
        window.onload = () => {
          try { window.print(); } catch (e) {}
        };
      </script>
    @endif
  </body>
</html>
