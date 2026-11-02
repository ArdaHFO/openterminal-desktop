$ErrorActionPreference = 'Stop'
foreach ($part in @('server', 'web')) {
  Push-Location (Join-Path $PSScriptRoot $part)
  try {
    & npm.cmd ci --workspaces=false --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed for $part" }
  } finally { Pop-Location }
}
Write-Host 'Installation complete. Run start-windows.ps1 to start the local app.'
