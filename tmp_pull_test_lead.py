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

$tenantId = 41;
$pageId = "608128752383598";
$leadId = "postman-test-" . time();
app()->instance("current_tenant_id", $tenantId);

app(App\Services\MetaLeadService::class)->processLead($tenantId, $leadId, $pageId);

$lead = App\Models\Lead::withoutGlobalScopes()
    ->where("tenant_id", $tenantId)
    ->orderByDesc("id")
    ->first(["id","name","email","phone","source","created_at"]);

echo json_encode([
    "synthetic_lead_id" => $leadId,
    "created" => $lead?->toArray(),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
'''

sftp = client.open_sftp()
with sftp.file("/tmp/synth_lead.php", "w") as f:
    f.write(php)

stdin, stdout, stderr = client.exec_command("php /tmp/synth_lead.php", timeout=90)
out.write_text(stdout.read().decode("utf-8", "replace") + "\n" + stderr.read().decode("utf-8", "replace")[:1500], encoding="utf-8")
print("done")
client.close()
