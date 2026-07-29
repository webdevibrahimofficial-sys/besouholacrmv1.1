param(
    [string]$Timestamp,
    [string]$OutputDir = 'deploy-artifacts'
)

$ErrorActionPreference = 'Stop'

if (-not $Timestamp) {
    $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
}

function New-TarGzFromDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDir,
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,
        [string[]]$Excludes = @()
    )

    $sourcePath = Resolve-Path $SourceDir
    $archiveFullPath = Join-Path (Get-Location) $ArchivePath

    $tarArgs = @(
        '-czf', $archiveFullPath
    )

    foreach ($exclude in $Excludes) {
        $tarArgs += "--exclude=$exclude"
    }

    $tarArgs += @('-C', $sourcePath, '.')

    & tar @tarArgs

    if ($LASTEXITCODE -ne 0) {
        throw "tar failed while creating $ArchivePath"
    }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$apiArchive = Join-Path $OutputDir "monorepo-api-$Timestamp.tgz"
$frontendArchive = Join-Path $OutputDir "monorepo-frontend-$Timestamp.tgz"

$apiExcludes = @(
    '.env',
    'vendor',
    'node_modules',
    'bootstrap/cache/*.php',
    'bootstrap/cache/*.json',
    'bootstrap/cache/*.tmp',
    'storage/logs',
    'storage/framework/cache',
    'storage/framework/sessions',
    'storage/framework/views',
    '*.log',
    '*.tmp',
    '.phpunit.result.cache'
)

$frontendExcludes = @(
    'node_modules',
    '*.log'
)

New-TarGzFromDirectory -SourceDir 'api' -ArchivePath $apiArchive -Excludes $apiExcludes
New-TarGzFromDirectory -SourceDir 'frontend' -ArchivePath $frontendArchive -Excludes $frontendExcludes

Write-Host "Created artifacts:"
Write-Host " - $apiArchive"
Write-Host " - $frontendArchive"
Write-Host ''
Write-Host 'Backend artifact excludes bootstrap/cache manifests so production does not load dev-only providers.'
