$ErrorActionPreference = "Stop"

$composeFile = Join-Path $PSScriptRoot "api\docker-compose.yml"

Write-Host "Starting Be Souhola CRM with Docker..." -ForegroundColor Cyan
docker compose -f $composeFile up -d --build

Write-Host ""
Write-Host "Container status:" -ForegroundColor Cyan
docker compose -f $composeFile ps

Write-Host ""
Write-Host "Local URLs:" -ForegroundColor Cyan
Write-Host "Frontend:   http://localhost:5173"
Write-Host "Backend:    http://localhost"
Write-Host "phpMyAdmin: http://localhost:8082"
Write-Host "MySQL:      localhost:3306"
