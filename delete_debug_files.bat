@echo off
cd /d "D:\fullstack\besouholacrm v1\besouholacrm v1\api"

REM Delete all debug files
del /q verify_delayed_endpoint.php 2>nul
del /q update_module_keys.php 2>nul
del /q tinker_script.php 2>nul
del /q test_team_stats.php 2>nul
del /q test_smtp.php 2>nul
del /q test_project.php 2>nul
del /q test_login_flow.php 2>nul
del /q test_lead_action.php 2>nul
del /q test_json_structure.php 2>nul
del /q test_impersonate.php 2>nul
del /q test_action_fetch_v2.php 2>nul
del /q test_action_fetch.php 2>nul
del /q debug_tenant_actions.php 2>nul
del /q debug_tenant2.php 2>nul
del /q debug_lead_save.php 2>nul
del /q check_roles.php 2>nul
del /q check_revenue.php 2>nul
del /q check_notifications_db.php 2>nul
del /q check_modules.php 2>nul
del /q check_action_55.php 2>nul
del /q test.php 2>nul
del /q backfill_revenue.php 2>nul
del /q check_settings.php 2>nul
del /q check_schema.php 2>nul
del /q check_tokens.php 2>nul
del /q check_user_tenant.php 2>nul
del /q create_test_notification_v2.php 2>nul
del /q create_test_notification_data.php 2>nul
del /q enable_all_modules.php 2>nul
del /q dump_notifications.php 2>nul
del /q read_last_error.php 2>nul
del /q read_last_error_short.php 2>nul
del /q seed_test_actions.php 2>nul
del /q debug_types.php 2>nul
del /q debug_tokens.php 2>nul

echo Debug files deleted successfully!
dir *.php | find /c ".php"
