param([string]$BackupDir = "./backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$out = Join-Path $BackupDir "ctf_platform_$stamp.dump"
pg_dump --format=custom --no-owner --no-acl --file=$out
Get-ChildItem $BackupDir -Filter "ctf_platform_*.dump" | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 14 | Remove-Item -Force
Write-Host "Backup written to $out"
