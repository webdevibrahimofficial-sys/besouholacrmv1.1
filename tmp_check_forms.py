import os
from pathlib import Path

import paramiko

host = "72.60.89.184"
user = "root"
password = os.environ.get("BESOUHOLA_SSH_PASS") or "Aq0''LhvrmJS(ggt"
out = Path(r"D:\\fullstack\\besouholacrm v1\\besouholacrm v1\\tmp_wh_check.txt")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)

php = r'''<?php
require "/var/www/besouhola/monorepo/api/vendor/autoload.php";
$app = require "/var/www/besouhola/monorepo/api/bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$page = App\Models\MetaPage::withoutGlobalScopes()
    ->where("tenant_id", 41)
    ->where("page_id", "608128752383598")
    ->where("is_active", true)
    ->firstOrFail();

$creds = app(App\Services\MetaCredentialsResolver::class)->resolveForTenant(41);
$pageTok = (string) $page->page_token;
$secret = (string) ($creds["app_secret"] ?? "");
$proof = $secret !== "" ? hash_hmac("sha256", $pageTok, $secret) : null;
$base = "https://graph.facebook.com/v19.0";

function g($url, $proof) {
    if ($proof) $url .= (str_contains($url, "?") ? "&" : "?") . "appsecret_proof=" . urlencode($proof);
    $res = Illuminate\Support\Facades\Http::timeout(30)->get($url);
    return ["status" => $res->status(), "json" => $res->json()];
}

$formIds = ["2738330576499508", "2280225572526883"];
$forms = [];
foreach ($formIds as $fid) {
    $forms[$fid] = g("{$base}/{$fid}?fields=id,name,status,locale,leads_count,created_time,questions,organic_leads,is_optimized_for_quality,allow_organic_lead,expired_leads_count,page_id,privacy_policy_url,thank_you_page,follow_up_action_url&access_token=" . urlencode($pageTok), $proof);
    $forms[$fid . "_leads"] = g("{$base}/{$fid}/leads?fields=id,created_time,field_data,ad_id,form_id,is_organic&limit=5&access_token=" . urlencode($pageTok), $proof);
}

$pageForms = g("{$base}/608128752383598/leadgen_forms?fields=id,name,status,leads_count,locale,created_time&limit=20&access_token=" . urlencode($pageTok), $proof);
$subs = g("{$base}/608128752383598/subscribed_apps?access_token=" . urlencode($pageTok), $proof);

echo json_encode([
    "app_id" => $creds["app_id"] ?? null,
    "page_forms" => $pageForms,
    "subscribed_apps" => $subs,
    "form_details" => $forms,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
'''

sftp = client.open_sftp()
with sftp.file("/tmp/check_forms.php", "w") as f:
    f.write(php)

cmds = [
    "php /tmp/check_forms.php",
    "grep -E '2026-08-09 02:(1|2)' /var/www/besouhola/monorepo/api/storage/logs/laravel.log | grep -E 'Meta Webhook Receive|Meta Lead|No tenant|ProcessMetaLead|leadgen' | tail -n 30",
]

parts = []
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    parts.append("=== " + cmd[:70] + " ===\n")
    parts.append(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        parts.append("ERR:" + err[:1500] + "\n")

out.write_text("\n".join(parts), encoding="utf-8")
print("done")
client.close()
