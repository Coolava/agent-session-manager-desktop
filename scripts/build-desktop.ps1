$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskDesktop = Join-Path $taskRoot 'desktop'
Push-Location (Join-Path $taskRoot 'frontend')
try {
    npm run build:desktop
    if ($LASTEXITCODE -ne 0) { throw 'Desktop frontend build failed.' }
} finally { Pop-Location }
Move-Item -LiteralPath "$taskDesktop/assets/desktop.html" -Destination "$taskDesktop/assets/index.html" -Force

$taskLocalGo = Join-Path $taskRoot '.tools/go/bin'
if (Test-Path "$taskLocalGo/go.exe") { $env:PATH = "$taskLocalGo;$env:PATH" }
Push-Location $taskDesktop
try {
    New-Item -ItemType Directory -Force -Path 'build' | Out-Null
    Copy-Item -LiteralPath "$taskRoot/build/appicon.png" -Destination 'build/appicon.png' -Force
    go run github.com/wailsapp/wails/v2/cmd/wails@v2.14.0 build -skipbindings -s -o desktop-session-manager.exe
    if ($LASTEXITCODE -ne 0) { throw 'Desktop executable build failed.' }
} finally { Pop-Location }
Write-Output "Built: $taskDesktop/build/bin/desktop-session-manager.exe"
