#!/bin/bash
# ============================================
# WhatsApp Mirror - Rollback Script
# ============================================
# Usage: ./rollback.sh [TIMESTAMP]

set -e

TIMESTAMP="${1:-}"
if [ -z "$TIMESTAMP" ]; then
    echo "Usage: ./rollback.sh <timestamp>"
    echo "Example: ./rollback.sh 20250727_143022"
    echo ""
    echo "Available backups:"
    ls -d backups_* 2>/dev/null || echo "  No backups found."
    exit 1
fi

BACKUP_DIR="backups_${TIMESTAMP}"

if [ ! -d "${BACKUP_DIR}" ]; then
    echo "❌ Backup directory not found: ${BACKUP_DIR}"
    exit 1
fi

echo "=========================================="
echo "🔙 Rolling back to: ${TIMESTAMP}"
echo "=========================================="
echo ""

read -p "⚠️  This will restore files and database. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Rollback cancelled."
    exit 1
fi

echo "🗄️  Step 1: Restoring database..."
DB_NAME="besouholacrm_db"
mysql -u root -p "${DB_NAME}" < "${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql" 2>/dev/null || {
    echo "❌ Database restore failed."
    exit 1
}
echo "✅ Database restored."

echo ""
echo "📁 Step 2: Restoring files..."
for bak in "${BACKUP_DIR}"/*.bak; do
    if [ -f "$bak" ]; then
        # Extract destination from filename
        filename=$(basename "$bak" .bak)
        case "$filename" in
            WhatsappMirrorWebhookController.php)
                cp "$bak" api/app/Http/Controllers/Internal/WhatsappMirrorWebhookController.php
                ;;
            ProcessIncomingMirrorMessage.php)
                cp "$bak" api/app/Jobs/ProcessIncomingMirrorMessage.php
                ;;
            WhatsappMessage.php)
                cp "$bak" api/app/Models/WhatsappMessage.php
                ;;
            WhatsappMirrorSession.php)
                cp "$bak" api/app/Models/WhatsappMirrorSession.php
                ;;
            manager.js)
                cp "$bak" wa-mirror-service/src/sessions/manager.js
                ;;
            webhook-client.js)
                cp "$bak" wa-mirror-service/src/webhook-client.js
                ;;
        esac
        echo "  ✅ Restored: ${filename}"
    fi
done

echo ""
echo "🧹 Step 3: Clearing caches..."
cd api
php artisan optimize:clear
php artisan config:cache
php artisan route:cache

echo ""
echo "=========================================="
echo "✅ Rollback Complete!"
echo "=========================================="
echo ""
echo "⚠️  Remember to restart wa-mirror-service!"
