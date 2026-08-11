import os
import re

import paramiko

host = "72.60.89.184"
user = "root"
password = os.environ.get("BESOUHOLA_SSH_PASS") or "Aq0''LhvrmJS(ggt"
env_path = "/var/www/besouhola/monorepo/api/.env"
scopes = "pages_show_list,leads_retrieval,pages_read_engagement,pages_manage_metadata,business_management,ads_read,pages_manage_ads"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)
sftp = client.open_sftp()

with sftp.file(env_path, "r") as f:
    content = f.read().decode("utf-8", "replace")

if re.search(r"^FACEBOOK_SCOPES=.*$", content, flags=re.M):
    new_content = re.sub(r"^FACEBOOK_SCOPES=.*$", f"FACEBOOK_SCOPES={scopes}", content, count=1, flags=re.M)
else:
    new_content = content.rstrip() + f"\nFACEBOOK_SCOPES={scopes}\n"

with sftp.file(env_path, "w") as f:
    f.write(new_content)

# upload defaults too
local_api = r"D:\fullstack\besouholacrm v1\besouholacrm v1\api"
for rel in ["config/services.php", "app/Services/MetaAuthService.php"]:
    sftp.put(f"{local_api}/{rel.replace('/', os.sep)}", f"/var/www/besouhola/monorepo/api/{rel}")
    print("uploaded", rel)

cmds = [
    "grep '^FACEBOOK_SCOPES=' /var/www/besouhola/monorepo/api/.env",
    "cd /var/www/besouhola/monorepo/api && php artisan config:clear && php artisan config:cache",
    """cd /var/www/besouhola/monorepo/api && php -r 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); echo json_encode(config("services.facebook.scopes"));'""",
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    print(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err[:1000])

client.close()
print("done")
