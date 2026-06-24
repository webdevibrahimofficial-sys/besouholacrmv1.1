#!/bin/bash
# ============================================
# WhatsApp Mirror - Production Deploy Script
# ============================================
# Run this AFTER backup.sh

set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "🚀 WhatsApp Mirror Production Deploy"
echo "=========================================="
echo "Timestamp: ${TIMESTAMP}"
echo ""

# Check if backup exists
if [ ! -d "backups_${TIMESTAMP}" ] && [ ! -d "backups_"* ]; then
    echo "⚠️  WARNING: No backup folder found!"
    echo "   Run ./backup.sh first to create a backup."
    read -p "Continue without backup? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Deploy cancelled."
        exit 1
    fi
fi

echo "🔧 Step 1: Copying modified files..."

# API files
cp "${DEPLOY_DIR}/api/app/Http/Controllers/Internal/WhatsappMirrorWebhookController.php" api/app/Http/Controllers/Internal/
cp "${DEPLOY_DIR}/api/app/Jobs/ProcessIncomingMirrorMessage.php" api/app/Jobs/
cp "${DEPLOY_DIR}/api/app/Jobs/ProcessHistorySyncBatch.php" api/app/Jobs/
cp "${DEPLOY_DIR}/api/app/Models/WhatsappMessage.php" api/app/Models/
cp "${DEPLOY_DIR}/api/app/Models/WhatsappMirrorSession.php" api/app/Models/
cp "${DEPLOY_DIR}/api/app/Services/Whatsapp/WhatsappMirrorProvider.php" api/app/Services/Whatsapp/
cp "${DEPLOY_DIR}/api/app/Support/LeadPhoneMatcher.php" api/app/Support/
cp "${DEPLOY_DIR}/api/app/Http/Controllers/WhatsappMessageController.php" api/app/Http/Controllers/
cp "${DEPLOY_DIR}/api/app/Http/Controllers/Api/WhatsappMirrorController.php" api/app/Http/Controllers/Api/
cp "${DEPLOY_DIR}/api/routes/api.php" api/routes/

# Migrations
cp "${DEPLOY_DIR}/api/database/migrations/2026_07_27_000000_add_history_synced_at_to_whatsapp_mirror_sessions.php" api/database/migrations/
cp "${DEPLOY_DIR}/api/database/migrations/2026_07_27_000001_add_source_and_lead_id_to_whatsapp_messages.php" api/database/migrations/

# Node service files
cp "${DEPLOY_DIR}/wa-mirror-service/src/sessions/manager.js" wa-mirror-service/src/sessions/
cp "${DEPLOY_DIR}/wa-mirror-service/src/webhook-client.js" wa-mirror-service/src/

echo "✅ Files copied successfully."

echo ""
echo "🗄️  Step 2: Running migrations..."
cd api
php artisan migrate --force

echo ""
echo "🧹 Step 3: Clearing caches..."
php artisan optimize:clear
php artisan config:cache
php artisan route:cache

echo ""
echo "🔄 Step 4: Restarting queue workers..."
php artisan queue:restart || true

echo ""
echo "=========================================="
echo "✅ Deploy Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart wa-mirror-service (pm2 restart or docker restart)"
echo "  2. Test: Send a WhatsApp message from your phone"
echo "  3. Test: Pair a new number and check history sync"
echo ""
echo "To rollback: ./rollback.sh ${TIMESTAMP}"
