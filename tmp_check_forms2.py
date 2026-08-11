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

$row = Illuminate\Support\Facades\DB::table("tenant_meta_apps")->where("tenant_id", 41)->first();
$expectedPath = $row ? ("/api/meta/webhook/" . $row->webhook_key) : null;

echo json_encode([
    "mode" => $row->mode ?? null,
    "app_id" => $row->app_id ?? null,
    "webhook_key_len" => isset($row->webhook_key) ? strlen((string)$row->webhook_key) : null,
    "webhook_key_prefix" => isset($row->webhook_key) ? substr((string)$row->webhook_key, 0, 8) : null,
    "expected_callback_suffix" => $expectedPath,
    "is_active" => $row->is_active ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
'''

sftp = client.open_sftp()
with sftp.file("/tmp/check_wh_key.php", "w") as f:
    f.write(php)

cmds = [
    "php /tmp/check_wh_key.php",
    # nginx access around lead tests
    "grep -E 'meta/webhook' /var/log/nginx/access.log 2>/dev/null | tail -n 40 || grep -E 'meta/webhook' /var/log/nginx/*access* 2>/dev/null | tail -n 40 || ls /var/log/nginx | head",
    "grep -E '2026-08-09 02:1[3-9]|2026-08-09 02:2' /var/www/besouhola/monorepo/api/storage/logs/laravel.log | grep -iE 'webhook|lead' | tail -n 40",
]

parts = []
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    parts.append("=== " + cmd[:80] + " ===\n")
    parts.append(stdout.read().decode("utf-8", "replace")[:8000])
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        parts.append("ERR:" + err[:1000] + "\n")

out.write_text("\n".join(parts), encoding="utf-8")
print("done")
client.close()
