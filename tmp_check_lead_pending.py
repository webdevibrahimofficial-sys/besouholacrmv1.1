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
$conn = App\Models\MetaConnection::withoutGlobalScopes()->whereKey($page->connection_id)->first();
$creds = app(App\Services\MetaCredentialsResolver::class)->resolveForTenant(41);
$shared = app(App\Services\MetaSystemSettingsService::class)->resolveSharedCredentials(false);

$pageTok = (string) $page->page_token;
$userTok = (string) ($conn->user_access_token ?? "");
$secret = (string) ($creds["app_secret"] ?? "");
$proof = $secret !== "" ? hash_hmac("sha256", $pageTok, $secret) : null;
$uProof = $secret !== "" ? hash_hmac("sha256", $userTok, $secret) : null;

function httpGet($url, $proof = null) {
    if ($proof) $url .= (str_contains($url, "?") ? "&" : "?") . "appsecret_proof=" . urlencode($proof);
    $res = Illuminate\Support\Facades\Http::timeout(25)->get($url);
    return ["status" => $res->status(), "json" => $res->json()];
}

$base = "https://graph.facebook.com/v19.0";
$pageId = "608128752383598";

$info = httpGet("{$base}/{$pageId}?fields=id,name,is_published,leadgen_tos_accepted,leadgen_tos_accepting_user,access_token&access_token=" . urlencode($pageTok), $proof);
$subs = httpGet("{$base}/{$pageId}/subscribed_apps?access_token=" . urlencode($pageTok), $proof);
$forms = httpGet("{$base}/{$pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=10&access_token=" . urlencode($pageTok), $proof);
$dbgPage = httpGet("{$base}/debug_token?input_token=" . urlencode($pageTok) . "&access_token=" . urlencode($pageTok), $proof);
$dbgUser = $userTok !== "" ? httpGet("{$base}/debug_token?input_token=" . urlencode($userTok) . "&access_token=" . urlencode($userTok), $uProof) : null;

// try accept ToS endpoint documentation sometimes uses POST /{page-id}/leadgen_tos_accepting
$acceptProbe = null;
try {
    $url = "{$base}/{$pageId}/leadgen_tos_accepting";
    $res = Illuminate\Support\Facades\Http::asForm()->timeout(25)->post($url, array_filter([
        "access_token" => $pageTok,
        "appsecret_proof" => $proof,
    ]));
    $acceptProbe = ["status" => $res->status(), "json" => $res->json()];
} catch (Throwable $e) {
    $acceptProbe = ["error" => $e->getMessage()];
}

$infoAfter = httpGet("{$base}/{$pageId}?fields=id,leadgen_tos_accepted,leadgen_tos_accepting_user&access_token=" . urlencode($pageTok), $proof);

echo json_encode([
    "scopes_config" => config("services.facebook.scopes"),
    "connection_id" => $page->connection_id,
    "conn_updated_at" => (string) ($conn->updated_at ?? ""),
    "page_info" => $info,
    "subscribed_apps" => $subs,
    "forms" => $forms,
    "debug_page_token" => $dbgPage,
    "debug_user_token_scopes" => data_get($dbgUser, "json.data.scopes"),
    "accept_probe" => $acceptProbe,
    "page_info_after_accept_probe" => $infoAfter,
    "custom_app" => $creds["app_id"] ?? null,
    "shared_app" => $shared["app_id"] ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
'''

sftp = client.open_sftp()
with sftp.file("/tmp/recheck_pending2.php", "w") as f:
    f.write(php)

cmds = [
    "php /tmp/recheck_pending2.php",
    "grep -E '2026-08-09 02:' /var/www/besouhola/monorepo/api/storage/logs/laravel.log | grep -E 'Meta Webhook|Meta Lead|No tenant|pages_manage_ads|lead forms|OAuth redirect' | tail -n 40",
]

parts = []
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    parts.append("=== " + cmd[:70] + " ===\n")
    parts.append(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        parts.append("ERR:" + err[:2000] + "\n")

out.write_text("\n".join(parts), encoding="utf-8")
print("done")
client.close()
