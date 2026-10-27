$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
$nextPath = Join-Path $projectRoot 'frontend/node_modules/next/dist/bin/next'
if (!(Test-Path -LiteralPath $pythonPath) -or !(Test-Path -LiteralPath $nextPath) -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'frontend/.next/BUILD_ID'))) {
    throw 'Install dependencies and run npm run build first. See README.md.'
}
foreach ($port in @(3000, 8000)) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $listener.Start() } catch { throw "Port $port is in use. Stop the previous Inkword preview or use the manual commands in README.md." } finally { $listener.Stop() }
}
$logDir = Join-Path $projectRoot '.logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$backendProcess = $null
$frontendProcess = $null
try {
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList '-m uvicorn app.main:app --host 127.0.0.1 --port 8000' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'backend.out.log') -RedirectStandardError (Join-Path $logDir 'backend.err.log')
    $frontendProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + $nextPath + '" start --hostname 127.0.0.1') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'frontend.out.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log')
    Write-Host 'Inkword: http://127.0.0.1:3000'
    Write-Host 'Keep this window open. Ctrl+C stops both services. Logs: .logs/'
    while (!$backendProcess.HasExited -and !$frontendProcess.HasExited) { Start-Sleep -Seconds 1 }
    throw 'A service stopped. Check .logs/ for details.'
} finally {
    foreach ($service in @($backendProcess, $frontendProcess)) {
        if ($service -and !$service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue }
    }
}
