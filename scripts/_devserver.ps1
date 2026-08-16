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
$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css"; ".js"="application/javascript"; ".json"="application/json"; ".csv"="text/csv"
  ".pdf"="application/pdf"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"
  ".txt"="text/plain; charset=utf-8"; ".zip"="application/zip"
  ".doc"="application/msword"; ".docx"="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ".xls"="application/vnd.ms-excel"; ".xlsx"="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ".ppt"="application/vnd.ms-powerpoint"; ".pptx"="application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ".hwp"="application/x-hwp"
}
$dataDir = Join-Path $Root "data"
$dataFile = Join-Path $dataDir "store.json"
$uploadsDir = Join-Path $dataDir "uploads"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
if (-not (Test-Path $uploadsDir)) { New-Item -ItemType Directory -Path $uploadsDir | Out-Null }

function Get-QueryParam($url, $key) {
  $q = $url.Query.TrimStart("?")
  foreach ($pair in $q -split "&") {
    if (-not $pair) { continue }
    $kv = $pair -split "=", 2
    if ([Uri]::UnescapeDataString($kv[0]) -eq $key) {
      return [Uri]::UnescapeDataString($(if ($kv.Length -gt 1) { $kv[1] } else { "" }))
    }
  }
  return $null
}

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
    elseif ($path -eq "/api/upload" -and $req.HttpMethod -eq "POST") {
      $classId = Get-QueryParam $req.Url "classId"
      $materialId = Get-QueryParam $req.Url "materialId"
      $filename = Get-QueryParam $req.Url "filename"
      if ($classId -notmatch '^c[1-7]$' -or $materialId -notmatch '^[a-z0-9]+$' -or -not $filename) {
        $res.StatusCode = 400
      } else {
        $safeName = [System.IO.Path]::GetFileName($filename) -replace '[\\/:*?"<>|]', '_'
        $destDir = Join-Path $uploadsDir "$classId\$materialId"
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        $destFile = Join-Path $destDir $safeName
        $fs = [System.IO.File]::Create($destFile)
        $req.InputStream.CopyTo($fs)
        $fs.Close()
        $size = (Get-Item $destFile).Length
        $json = "{`"fileName`":`"$($safeName -replace '\\','\\\\' -replace '"','\"')`",`"size`":$size}"
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $res.ContentType = "application/json; charset=utf-8"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    }
    elseif ($path -eq "/api/upload" -and $req.HttpMethod -eq "DELETE") {
      $classId = Get-QueryParam $req.Url "classId"
      $materialId = Get-QueryParam $req.Url "materialId"
      if ($classId -match '^c[1-7]$' -and $materialId -match '^[a-z0-9]+$') {
        $target = Join-Path $uploadsDir "$classId\$materialId"
        Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
      }
      $res.StatusCode = 200
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
