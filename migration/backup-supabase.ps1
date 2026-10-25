$ErrorActionPreference = 'Stop'
# Does not change Supabase data. Password is prompted by pg_dump, not stored here.
$tool = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $tool) { throw 'Install PostgreSQL Command Line Tools first.' }
$dbHost = Read-Host 'Supabase Session pooler host (Connection parameters > host)'
$dbUser = Read-Host 'Supabase user (Connection parameters > user)'
$backupPath = Join-Path $PSScriptRoot ('supabase-public-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
$previousSsl = $env:PGSSLMODE
try {
    $env:PGSSLMODE = 'require'
    & $tool.FullName --host=$dbHost --port=5432 --username=$dbUser --dbname=postgres --password --format=custom --schema=public --no-owner --no-acl --verbose --file=$backupPath
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Do not restore this file or switch DATABASE_URL. Keep all error messages.' }
    & (Join-Path $tool.Directory.FullName 'pg_restore.exe') --list $backupPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Backup archive validation failed.' }
    Write-Host "Backup completed: $backupPath"
    Write-Host 'This contains public tables, data, sequences and DB functions; it does NOT include uploaded files or server encryption keys.'
} finally { $env:PGSSLMODE = $previousSsl }
