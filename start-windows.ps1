param([switch]$NoBrowser, [switch]$KeepAlive)
$ErrorActionPreference = 'Stop'
$api = 'http://127.0.0.1:4000/api/status'
$web = 'http://localhost:3000/'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$logDir = Join-Path $PSScriptRoot 'data\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
function IsListening([int]$port) {
  $socket = [System.Net.Sockets.TcpClient]::new()
  try { $socket.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $socket.Dispose() }
}
if (IsListening 4000) {
  try { if (-not (Invoke-RestMethod $api -TimeoutSec 3).ok) { throw 'Unexpected response' } }
  catch { throw 'Port 4000 is occupied by another service; no process was changed.' }
} else {
  $server = Join-Path $PSScriptRoot 'server'
  Start-Process -FilePath $node -ArgumentList 'node_modules/tsx/dist/cli.mjs','src/index.ts' -WorkingDirectory $server -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'api.out.log') -RedirectStandardError (Join-Path $logDir 'api.err.log') | Out-Null
  for ($i=0; $i -lt 20; $i++) { try { if ((Invoke-RestMethod $api -TimeoutSec 2).ok) { break } } catch {}; Start-Sleep -Milliseconds 500 }
  try { if (-not (Invoke-RestMethod $api -TimeoutSec 3).ok) { throw 'API not ready' } } catch { throw 'OpenTerminal API did not start. Check data/logs/api.err.log.' }
}
if (IsListening 3000) {
  try { if ((Invoke-WebRequest $web -UseBasicParsing -TimeoutSec 20).Content -notmatch 'OpenTerminal') { throw 'Unexpected response' } }
  catch { throw 'Port 3000 is occupied by another service; no process was changed.' }
} else {
  $webDir = Join-Path $PSScriptRoot 'web'
  Start-Process -FilePath $node -ArgumentList 'node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000' -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'web.out.log') -RedirectStandardError (Join-Path $logDir 'web.err.log') | Out-Null
  for ($i=0; $i -lt 90; $i++) { try { if ((Invoke-WebRequest $web -UseBasicParsing -TimeoutSec 3).Content -match 'OpenTerminal') { break } } catch {}; Start-Sleep -Milliseconds 500 }
  try { if ((Invoke-WebRequest $web -UseBasicParsing -TimeoutSec 10).Content -notmatch 'OpenTerminal') { throw 'Unexpected page' } } catch { throw 'OpenTerminal web app did not start. Check data/logs/web.err.log.' }
}
Write-Host "OpenTerminal is ready at $web"
if (-not $NoBrowser) { Start-Process $web | Out-Null }
if ($KeepAlive) {
  Write-Host 'Keep this window open while using OpenTerminal. Press Ctrl+C to stop the launcher.'
  while ((IsListening 3000) -and (IsListening 4000)) { Start-Sleep -Seconds 10 }
  Write-Warning 'A local OpenTerminal service stopped. See data/logs for details.'
}
