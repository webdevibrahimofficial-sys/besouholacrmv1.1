$ErrorActionPreference = 'Stop'

$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$suspectPattern = '[ÃØÙâï]'
$extensions = @('.js', '.jsx', '.ts', '.tsx', '.json', '.php', '.html', '.css')

function Repair-Text([string] $text) {
  $current = $text
  for ($i = 0; $i -lt 3; $i++) {
    if ($current -notmatch $suspectPattern) {
      break
    }

    $next = $utf8.GetString($enc1252.GetBytes($current))
    if ($next -eq $current) {
      break
    }

    $current = $next
  }

  return $current
}

function Should-Flag([string] $original, [string] $repaired) {
  if ([string]::Equals($original, $repaired, [System.StringComparison]::Ordinal)) {
    return $false
  }

  if ($original -notmatch $suspectPattern) {
    return $false
  }

  if ($repaired -match '[\u0600-\u06FF]') {
    return $true
  }

  return ($repaired -notmatch $suspectPattern)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$findings = New-Object System.Collections.Generic.List[object]
$pathsToScan = New-Object System.Collections.Generic.List[string]

$gitTracked = @()
try {
  $gitTracked = @(
    git -C $repoRoot diff --name-only --diff-filter=ACMRTUXB HEAD --
    git -C $repoRoot ls-files --others --exclude-standard
  ) | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -Unique
} catch {
  $gitTracked = @()
}

if ($gitTracked.Count -gt 0) {
  foreach ($relativePath in $gitTracked) {
    $fullPath = Join-Path $repoRoot $relativePath
    if ((Test-Path -LiteralPath $fullPath) -and $extensions -contains ([System.IO.Path]::GetExtension($fullPath).ToLowerInvariant())) {
      $pathsToScan.Add($fullPath)
    }
  }
} else {
  $fallbackRoots = @(
    (Join-Path $repoRoot 'frontend\src'),
    (Join-Path $repoRoot 'frontend\public'),
    (Join-Path $repoRoot 'api\app')
  )

  foreach ($root in $fallbackRoots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
      $extensions -contains $_.Extension.ToLowerInvariant()
    } | ForEach-Object {
      $pathsToScan.Add($_.FullName)
    }
  }
}

foreach ($path in ($pathsToScan | Select-Object -Unique)) {
  $lineNumber = 0

  [System.IO.File]::ReadAllLines($path, $utf8) | ForEach-Object {
    $lineNumber++
    $original = [string] $_

    if ($original -notmatch $suspectPattern) {
      return
    }

    $repaired = Repair-Text $original
    if (Should-Flag $original $repaired) {
      $findings.Add([PSCustomObject]@{
        Path = $path
        Line = $lineNumber
        Original = $original.Trim()
        Suggested = $repaired.Trim()
      })
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host 'Detected suspicious mojibake-style text. Review these lines:' -ForegroundColor Red

  foreach ($item in $findings) {
    Write-Host ("- {0}:{1}" -f $item.Path, $item.Line) -ForegroundColor Yellow
    Write-Host ("  Current:   {0}" -f $item.Original)
    Write-Host ("  Suggested: {0}" -f $item.Suggested)
  }

  exit 1
}

Write-Host 'No suspicious mojibake text detected.' -ForegroundColor Green
