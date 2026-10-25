$ErrorActionPreference = 'Stop'
# Restore ONLY to a NEW EMPTY Neon database. Never use the Supabase host here.
$tool = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_restore.exe' -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $tool) { throw 'Install PostgreSQL Command Line Tools first.' }
$backupPath = (Read-Host 'Full path of completed .dump file').Trim('"')
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw 'Backup not found.' }
$dbHost = Read-Host 'Neon DIRECT host (must end with .neon.tech; no -pooler)'
if ($dbHost -notmatch '^[a-zA-Z0-9.-]+\.neon\.tech$' -or $dbHost -match '-pooler\.') { throw 'Use a Neon DIRECT hostname, not a Supabase or pooled hostname.' }
$dbUser = Read-Host 'Neon database user'
$dbName = Read-Host 'Neon database name (usually neondb)'
if ($dbName -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid database name.' }
$previousSsl = $env:PGSSLMODE
try {
    $env:PGSSLMODE = 'verify-full'
    $psql = Join-Path $tool.Directory.FullName 'psql.exe'
    # Each tool prompts for the target password. No password appears in command history.
    & $psql -h $dbHost -p 5432 -U $dbUser -d $dbName -W -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot 'neon-prerequisites.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Empty DB / extension preparation failed. Do not continue.' }
    & $tool.FullName -h $dbHost -p 5432 -U $dbUser -d $dbName -W --no-owner --no-acl --exit-on-error --single-transaction --verbose $backupPath
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed and was rolled back. Do not switch the server. Save the error message.' }
    Write-Host 'Restore completed. Compare source and target before setting DATABASE_URL.'
} finally { $env:PGSSLMODE = $previousSsl }
