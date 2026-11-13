param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:STACKFLOW_BACKUP_PASSPHRASE)) {
  throw 'Đặt STACKFLOW_BACKUP_PASSPHRASE trước khi sao lưu.'
}

$target = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $target -Force | Out-Null
$scratch = Join-Path $env:TEMP ('StackFlowBackup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$schema = Join-Path $scratch 'schema.sql'
$data = Join-Path $scratch 'data.sql'
$schemaEncrypted = Join-Path $target "$ProjectRef-$stamp-schema.sfb"
$dataEncrypted = Join-Path $target "$ProjectRef-$stamp-data.sfb"

try {
  npx supabase db dump "--remote=$ProjectRef" --file $schema
  if ($LASTEXITCODE -ne 0) { throw 'Không xuất được schema.' }
  npx supabase db dump "--remote=$ProjectRef" --data-only --use-copy --file $data
  if ($LASTEXITCODE -ne 0) { throw 'Không xuất được data.' }
  node scripts/backup-crypto.mjs encrypt $schema $schemaEncrypted
  if ($LASTEXITCODE -ne 0) { throw 'Không mã hóa được schema.' }
  node scripts/backup-crypto.mjs encrypt $data $dataEncrypted
  if ($LASTEXITCODE -ne 0) { throw 'Không mã hóa được data.' }

  $manifest = [ordered]@{
    project_ref = $ProjectRef
    created_utc = $stamp
    schema_file = [System.IO.Path]::GetFileName($schemaEncrypted)
    schema_sha256 = (Get-FileHash -LiteralPath $schemaEncrypted -Algorithm SHA256).Hash
    data_file = [System.IO.Path]::GetFileName($dataEncrypted)
    data_sha256 = (Get-FileHash -LiteralPath $dataEncrypted -Algorithm SHA256).Hash
  }
  $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target "$ProjectRef-$stamp-manifest.json")
  Write-Output "Đã lưu backup mã hóa tại $target"
} finally {
  foreach ($plainFile in @($schema, $data)) {
    if (Test-Path -LiteralPath $plainFile) { Remove-Item -LiteralPath $plainFile -Force }
  }
  Remove-Item -LiteralPath $scratch -Force
}
