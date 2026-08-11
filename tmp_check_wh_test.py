import os
from pathlib import Path

import paramiko

host = "72.60.89.184"
user = "root"
password = os.environ.get("BESOUHOLA_SSH_PASS") or "Aq0''LhvrmJS(ggt"

php = r'''<?php
require "/var/www/besouhola/monorepo/api/vendor/autoload.php";
$app = require "/var/www/besouhola/monorepo/api/bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$since = now()->subMinutes(20);
$leads = Illuminate\Support\Facades\DB::table("leads")->where("tenant_id", 41)->where("created_at", ">=", $since)->orderByDesc("id")->limit(10)->get(["id","name","email","phone","source","created_at"]);
echo json_encode(["recent_leads" => $leads, "count" => count($leads)], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), PHP_EOL;
'''

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)
sftp = client.open_sftp()
with sftp.file("/tmp/check_wh.php", "w") as f:
    f.write(php)
sftp.close()

cmds = [
    "php /tmp/check_wh.php; rm -f /tmp/check_wh.php",
    "python3 - <<'PY'\nfrom pathlib import Path\ntext=Path('/var/www/besouhola/monorepo/api/storage/logs/laravel.log').read_text(errors='replace').splitlines()\nfor i,l in enumerate(text):\n    if '2026-08-09 01:5' in l and ('Meta ' in l or 'leadgen' in l.lower() or 'ProcessMetaLead' in l or 'webhook' in l.lower()):\n        print('\\n'.join(text[max(0,i):i+5])); print('---')\nPY",
]

chunks=[]
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    chunks.append(stdout.read().decode('utf-8','replace'))
Path(r'D:\fullstack\besouholacrm v1\besouholacrm v1\tmp_wh_check.txt').write_text('\n====\n'.join(chunks), encoding='utf-8')
print('done')
client.close()
