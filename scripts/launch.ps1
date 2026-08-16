param([string]$Root, [int]$Port = 8791, [switch]$Lan)

$logPath = Join-Path $Root "scripts\server.log"

function Show-Info($text, $title) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}
function Show-Error($text, $title) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($text, $title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
}

if ($Lan) {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    # relaunch this same script elevated (triggers the Windows UAC prompt) so the
    # server can bind to the LAN interface, which Windows blocks for normal users
    Start-Process powershell -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath,
      "-Root", $Root, "-Port", $Port, "-Lan"
    )
    exit 0
  }
}

Remove-Item $logPath -ErrorAction SilentlyContinue

$modeFile = Join-Path $Root "scripts\server.mode"
$pidFile = Join-Path $Root "scripts\server.pid"

$already = $false
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 1 | Out-Null
  $already = $true
} catch {}

# if a loopback-only server is already running but LAN access was just requested,
# restart it so it actually binds the network interface instead of just 127.0.0.1
if ($already -and $Lan) {
  $currentMode = if (Test-Path $modeFile) { (Get-Content $modeFile -Raw).Trim() } else { "local" }
  if ($currentMode -ne "lan") {
    if (Test-Path $pidFile) {
      try { Stop-Process -Id ([int](Get-Content $pidFile -Raw).Trim()) -Force -ErrorAction SilentlyContinue } catch {}
    }
    Start-Sleep -Milliseconds 500
    $already = $false
  }
}

if (-not $already) {
  $devArgs = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
    "-File", (Join-Path $Root "scripts\_devserver.ps1"),
    "-Root", $Root, "-Port", $Port
  )
  if ($Lan) { $devArgs += "-Lan" }
  Start-Process powershell -ArgumentList $devArgs | Out-Null

  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 300
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 1 | Out-Null
      $ok = $true
      break
    } catch { Start-Sleep -Milliseconds 0 }
  }

  if (-not $ok) {
    $detail = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { "(로그 파일이 생성되지 않았습니다. PowerShell 스크립트 실행이 차단되었을 수 있습니다.)" }
    Show-Error "대시보드 서버를 시작하지 못했습니다.`n`n$detail" "학생관리 대시보드 - 실행 오류"
    exit 1
  }
}

if ($Lan) {
  $ips = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress)
  $urls = ($ips | ForEach-Object { "http://$($_):$Port/index.html" }) -join "`n"
  Show-Info "같은 Wi-Fi(네트워크)에 연결된 휴대폰/다른 컴퓨터의 인터넷 브라우저에서 아래 주소를 입력하세요:`n`n$urls`n`n(방화벽 허용 팝업이 뜨면 '액세스 허용'을 눌러주세요.)" "학생관리 대시보드 - 다른 기기에서 접속하기"
}

Start-Process "http://127.0.0.1:$Port/index.html"
