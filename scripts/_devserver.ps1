param([string]$Root, [int]$Port = 8791, [switch]$Lan)
$logPath = Join-Path $Root "scripts\server.log"
try {
  $listener = New-Object System.Net.HttpListener
  if ($Lan) {
    $listener.Prefixes.Add("http://+:$Port/")
  } else {
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
  }
  $listener.Start()
} catch {
  ($_ | Out-String) | Set-Content -Path $logPath -Encoding UTF8
  exit 1
}
Set-Content -Path (Join-Path $Root "scripts\server.pid") -Value $PID -Encoding UTF8
Set-Content -Path (Join-Path $Root "scripts\server.mode") -Value $(if ($Lan) { "lan" } else { "local" }) -Encoding UTF8
$mime = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css"; ".js"="application/javascript"; ".json"="application/json"; ".csv"="text/csv" }
$dataDir = Join-Path $Root "data"
$dataFile = Join-Path $dataDir "store.json"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

while ($true) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $path = $req.Url.LocalPath

  try {
    if ($path -eq "/api/data" -and $req.HttpMethod -eq "GET") {
      $json = if (Test-Path $dataFile) { [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8) } else { "{}" }
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = "application/json; charset=utf-8"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    elseif ($path -eq "/api/data" -and $req.HttpMethod -eq "POST") {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      # validate JSON before writing so a bad request can't corrupt the saved file
      $body | ConvertFrom-Json | Out-Null
      [System.IO.File]::WriteAllText($dataFile, $body, (New-Object System.Text.UTF8Encoding($false)))
      $res.StatusCode = 200
      $ok = [System.Text.Encoding]::UTF8.GetBytes("ok")
      $res.ContentLength64 = $ok.Length
      $res.OutputStream.Write($ok, 0, $ok.Length)
    }
    else {
      if ($path -eq "/") { $path = "/index.html" }
      $file = Join-Path $Root ($path.TrimStart("/"))
      if ((Test-Path $file -PathType Leaf) -and ($file.StartsWith((Resolve-Path $Root).Path))) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file)
        $ctype = $mime[$ext]; if (-not $ctype) { $ctype = "application/octet-stream" }
        $res.ContentType = $ctype
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
