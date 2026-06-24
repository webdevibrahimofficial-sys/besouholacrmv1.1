# WhatsApp Mirror - History Sync + Bidirectional Sync
# Deployment Package
# Generated: $(date)

## 📁 Package Contents

```
deploy-whatsapp-mirror/
├── backup.sh              # Run FIRST - creates DB + file backup
├── deploy.sh              # Run SECOND - copies files + runs migrations
├── rollback.sh            # Emergency rollback script
├── README.md              # This file
│
├── api/                   # Laravel API changes
│   ├── app/
│   │   ├── Http/Controllers/
│   │   │   ├── Internal/WhatsappMirrorWebhookController.php
│   │   │   ├── WhatsappMessageController.php
│   │   │   └── Api/WhatsappMirrorController.php
│   │   ├── Jobs/
│   │   │   ├── ProcessIncomingMirrorMessage.php
│   │   │   └── ProcessHistorySyncBatch.php
│   │   ├── Models/
│   │   │   ├── WhatsappMessage.php
│   │   │   └── WhatsappMirrorSession.php
│   │   ├── Services/Whatsapp/
│   │   │   └── WhatsappMirrorProvider.php
│   │   └── Support/
│   │       └── LeadPhoneMatcher.php
│   ├── database/migrations/
│   │   ├── 2026_07_27_000000_add_history_synced_at_to_whatsapp_mirror_sessions.php
│   │   └── 2026_07_27_000001_add_source_and_lead_id_to_whatsapp_messages.php
│   └── routes/api.php
│
└── wa-mirror-service/     # Node.js microservice changes
    └── src/
        ├── sessions/manager.js
        └── webhook-client.js
```

## 🚀 Deployment Steps

### 1. Backup (REQUIRED)
```bash
cd deploy-whatsapp-mirror
chmod +x backup.sh deploy.sh rollback.sh
./backup.sh
```

### 2. Deploy
```bash
./deploy.sh
```

### 3. Restart wa-mirror-service
```bash
# If using Docker:
docker restart wa_mirror_service

# If using PM2:
pm2 restart wa-mirror-service

# If using systemd:
systemctl restart wa-mirror-service
```

## ✅ Post-Deploy Verification

1. **Send test message from CRM** → Should create 1 row only
2. **Send message from phone** → Should appear in CRM with `direction = 'outbound'`
3. **Pair new number** → Should import history for matching Leads only
4. **Check `whatsapp_messages` table** → No duplicate `message_id` for same tenant

## 🚨 Rollback (If Needed)
```bash
./rollback.sh <timestamp>
# Example: ./rollback.sh 20250727_143022
```

## 🔧 Manual Steps (If Scripts Fail)

### Database Backup
```bash
mysqldump -u root -p besouholacrm_db > backup.sql
```

### Migrations
```bash
cd api
php artisan migrate --force
```

### Cache Clear
```bash
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan queue:restart
```

## ⚠️ Important Notes

- **Do NOT overwrite `.env` file**
- **Migrations are safe** - they only ADD columns (no data loss)
- **History sync runs once per pairing** - disconnecting resets it
- **Synchronous processing** - jobs run inline to avoid Spatie queue issues
