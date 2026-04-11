# snapshot-teststeps.ps1
# Creates a versioned snapshot of userteststeps.md
# Usage: .\snapshot-teststeps.ps1

$notesDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $notesDir
$sourceFile = Join-Path $notesDir 'userteststeps.md'

# Read version from package.json
$packageJson = Get-Content (Join-Path $projectDir 'package.json') -Raw | ConvertFrom-Json
$version     = $packageJson.version

# Build datestamp
$datestamp = Get-Date -Format 'yyyy-MM-dd'

# Target filename
$targetName = "userteststeps-${version}-${datestamp}.md"
$targetFile = Join-Path $notesDir $targetName

# Copy the file
Copy-Item $sourceFile $targetFile

# Replace the header placeholders with actual version and date
$emdash  = [char]0x2014
$content = Get-Content $targetFile -Raw -Encoding UTF8
$content = $content -replace "# Petmate 9 $emdash Manual UI Test Steps", "# Petmate 9 $emdash Manual UI Test Steps (v${version} $emdash ${datestamp})"
$content = $content -replace '\*\*Version:\*\* _\(filled in by snapshot script\)_', "**Version:** ${version}"
$content = $content -replace '\*\*Date:\*\* _\(filled in by snapshot script\)_', "**Date:** ${datestamp}"
Set-Content $targetFile $content -NoNewline -Encoding UTF8

Write-Host "Snapshot created: $targetName"
