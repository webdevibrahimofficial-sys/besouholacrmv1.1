import os
from pathlib import Path

import paramiko

host = "72.60.89.184"
user = "root"
password = os.environ.get("BESOUHOLA_SSH_PASS") or "Aq0''LhvrmJS(ggt"
out = Path(r"D:\fullstack\besouholacrm v1\besouholacrm v1\tmp_wh_check.txt")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)

php = r'''<?php
require "/var/www/besouhola/monorepo/api/vendor/autoload.php";
$app = require "/var/www/besouhola/monorepo/api/bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$tenantId = 41;
app()->instance("current_tenant_id", $tenantId);

$page = App\Models\MetaPage::withoutGlobalScopes()
    ->where("tenant_id", $tenantId)
    ->where("is_active", true)
    ->first();

$conn = App\Models\MetaConnection::withoutGlobalScopes()->whereKey($page->connection_id)->first();
$creds = app(App\Services\MetaCredentialsResolver::class)->resolveForTenant($tenantId);

$pageTok = (string) ($page->page_token ?? "");
$userTok = (string) ($conn->user_access_token ?? "");
$secret = (string) ($creds["app_secret"] ?? "");

$integration = App\Models\Integration::where("tenant_id", $tenantId)->where("provider", "meta")->first();
$settings = is_array($integration?->settings) ? $integration->settings : [];

function probe($label, $url, $secret, $token) {
    $proof = ($secret !== "" && $token !== "") ? hash_hmac("sha256", $token, $secret) : null;
    if ($proof) $url .= (str_contains($url, "?") ? "&" : "?") . "appsecret_proof=" . urlencode($proof);
    try {
        $res = Illuminate\Support\Facades\Http::timeout(25)->get($url);
        return [
            "label" => $label,
            "http" => $res->status(),
            "body" => $res->json() ?? substr($res->body(), 0, 500),
        ];
    } catch (Throwable $e) {
        return ["label" => $label, "error" => $e->getMessage()];
    }
}

$base = "https://graph.facebook.com/v19.0";
$pid = $page->page_id;
$results = [
    "page_token_len" => strlen($pageTok),
    "user_token_len" => strlen($userTok),
    "app_id" => $creds["app_id"] ?? null,
    "secret_len" => strlen($secret),
    "settings_keys" => array_keys($settings),
    "settings_snippet" => [
        "auto_sync" => $settings["auto_sync"] ?? null,
        "lead_auto_sync" => $settings["lead_auto_sync"] ?? null,
        "enable_auto_sync" => $settings["enable_auto_sync"] ?? null,
        "autoSync" => $settings["autoSync"] ?? null,
    ],
];

if ($pageTok !== "") {
    $results["with_page_token"] = [
        probe("page_info", "{$base}/{$pid}?fields=id,name,is_published,leadgen_tos_accepted&access_token=" . urlencode($pageTok), $secret, $pageTok),
        probe("subscribed_apps", "{$base}/{$pid}/subscribed_apps?access_token=" . urlencode($pageTok), $secret, $pageTok),
        probe("forms", "{$base}/{$pid}/leadgen_forms?fields=id,name,status,leads_count&limit=5&access_token=" . urlencode($pageTok), $secret, $pageTok),
        probe("debug", "{$base}/debug_token?input_token=" . urlencode($pageTok) . "&access_token=" . urlencode($pageTok), $secret, $pageTok),
    ];
}

if ($userTok !== "") {
    $results["with_user_token"] = [
        probe("me_accounts", "{$base}/me/accounts?fields=id,name,access_token&limit=10&access_token=" . urlencode($userTok), $secret, $userTok),
        probe("debug_user", "{$base}/debug_token?input_token=" . urlencode($userTok) . "&access_token=" . urlencode($userTok), $secret, $userTok),
    ];
}

// Resubscribe page to leadgen using existing service
$sub = null;
try {
    if ($pageTok !== "") {
        $sub = app(App\Services\MetaAuthService::class)->subscribePageToLeadgenWebhook($pid, $pageTok);
    }
} catch (Throwable $e) {
    $sub = ["error" => $e->getMessage()];
}
$results["resubscribe"] = $sub;

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
'''

sftp = client.open_sftp()
with sftp.file("/tmp/prod_ownapp_test2.php", "w") as f:
    f.write(php)

stdin, stdout, stderr = client.exec_command("php /tmp/prod_ownapp_test2.php", timeout=120)
out.write_text(stdout.read().decode("utf-8", "replace") + "\nERR:\n" + stderr.read().decode("utf-8", "replace")[:2500], encoding="utf-8")
print("done")
client.close()
