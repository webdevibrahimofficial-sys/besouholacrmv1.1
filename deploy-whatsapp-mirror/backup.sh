#!/bin/bash
# ============================================
# WhatsApp Mirror - Production Backup Script
# ============================================
# Run this BEFORE deploying to production

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups_${TIMESTAMP}"
DB_NAME="besouholacrm_db"

echo "=========================================="
echo "🛡️  WhatsApp Mirror Deployment Backup"
echo "=========================================="
echo "Timestamp: ${TIMESTAMP}"
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "📦 Step 1: Backing up database..."
mysqldump -u root -p "${DB_NAME}" > "${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql" 2>/dev/null || {
    echo "❌ Database backup failed. Please check MySQL credentials."
    echo "   Run manually: mysqldump -u [user] -p[password] ${DB_NAME} > db_backup.sql"
    exit 1
}
echo "✅ Database backup saved: ${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql"

echo ""
echo "📁 Step 2: Backing up critical files..."

# Backup current WhatsApp-related files
cp api/app/Http/Controllers/Internal/WhatsappMirrorWebhookController.php "${BACKUP_DIR}/WhatsappMirrorWebhookController.php.bak" 2>/dev/null || true
cp api/app/Jobs/ProcessIncomingMirrorMessage.php "${BACKUP_DIR}/ProcessIncomingMirrorMessage.php.bak" 2>/dev/null || true
cp api/app/Models/WhatsappMessage.php "${BACKUP_DIR}/WhatsappMessage.php.bak" 2>/dev/null || true
cp api/app/Models/WhatsappMirrorSession.php "${BACKUP_DIR}/WhatsappMirrorSession.php.bak" 2>/dev/null || true
cp wa-mirror-service/src/sessions/manager.js "${BACKUP_DIR}/manager.js.bak" 2>/dev/null || true
cp wa-mirror-service/src/webhook-client.js "${BACKUP_DIR}/webhook-client.js.bak" 2>/dev/null || true

echo "✅ File backups saved to: ${BACKUP_DIR}/"

echo ""
echo "📋 Step 3: Checking migration status..."
cd api
php artisan migrate:status | grep -E "(2026_07_27|Ran|Yes)" || true
cd ..

echo ""
echo "=========================================="
echo "✅ Backup Complete!"
echo "=========================================="
echo "Backup location: ${BACKUP_DIR}/"
echo ""
echo "To restore from backup:"
echo "  mysql -u root -p ${DB_NAME} < ${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql"
echo ""
echo "To rollback files:"
echo "  cp ${BACKUP_DIR}/*.bak [destination]"
