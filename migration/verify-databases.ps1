$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer, then run npm install in the server folder.' }
function Read-DatabaseUrl($label, $database) {
    $h = Read-Host "$label host"
    $u = Read-Host "$label user"
    $d = Read-Host "$label database (usually $database)"
    if (-not $d) { $d = $database }
    if ($h -notmatch '^[a-zA-Z0-9.-]+$') { throw 'Invalid hostname.' }
    $secret = Read-Host "$label database password (hidden)" -AsSecureString
    $plain = [System.Net.NetworkCredential]::new('', $secret).Password
    return ('postgresql://' + [Uri]::EscapeDataString($u) + ':' + [Uri]::EscapeDataString($plain) + '@' + $h + ':5432/' + [Uri]::EscapeDataString($d) + '?sslmode=require')
}
$oldSource = $env:SOURCE_DATABASE_URL
$oldTarget = $env:TARGET_DATABASE_URL
try {
    $env:SOURCE_DATABASE_URL = Read-DatabaseUrl 'Supabase Session pooler' 'postgres'
    $env:TARGET_DATABASE_URL = Read-DatabaseUrl 'Neon DIRECT' 'neondb'
    & node (Join-Path $PSScriptRoot 'verify-databases.js')
    if ($LASTEXITCODE -ne 0) { throw 'Verification failed. Do not switch the server.' }
} finally {
    $env:SOURCE_DATABASE_URL = $oldSource
    $env:TARGET_DATABASE_URL = $oldTarget
}
