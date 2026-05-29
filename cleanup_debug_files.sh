#!/bin/bash
# Script to remove debug files from production repo
# Use: ./cleanup_debug_files.sh

cd api

# Array of debug files to remove
DEBUG_FILES=(
    "verify_delayed_endpoint.php"
    "update_module_keys.php"
    "tinker_script.php"
    "test_team_stats.php"
    "test_smtp.php"
    "test_project.php"
    "test_login_flow.php"
    "test_lead_action.php"
    "test_json_structure.php"
    "test_impersonate.php"
    "test_action_fetch_v2.php"
    "test_action_fetch.php"
    "debug_tenant_actions.php"
    "debug_tenant2.php"
    "debug_lead_save.php"
    "check_roles.php"
    "check_revenue.php"
    "check_notifications_db.php"
    "check_modules.php"
    "check_action_55.php"
    "test.php"
    "backfill_revenue.php"
    "check_settings.php"
    "check_schema.php"
    "check_tokens.php"
    "check_user_tenant.php"
    "create_test_notification_v2.php"
    "create_test_notification_data.php"
    "enable_all_modules.php"
    "dump_notifications.php"
    "read_last_error.php"
    "read_last_error_short.php"
    "seed_test_actions.php"
    "debug_types.php"
    "debug_tokens.php"
)

echo "🔐 Removing debug and test files from API..."

DELETED=0
for file in "${DEBUG_FILES[@]}"; do
    if [ -f "$file" ]; then
        git rm "$file" 2>/dev/null || rm "$file"
        echo "✓ Removed: $file"
        ((DELETED++))
    fi
done

cd ..

echo ""
echo "========================================="
echo "✅ Successfully removed $DELETED debug files"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Review changes: git status"
echo "2. Commit: git commit -m 'security: remove debug files from production'"
echo "3. Push: git push origin main"
