param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = python -c "import sys; print(sys.executable)"
$url = "http://127.0.0.1:$Port"

Push-Location $root

try {
  Write-Output "Serving Maladum web app at $url"
  Write-Output "Keep this terminal open while you use the app."
  Write-Output "Open $url in your browser."
  & $python -m http.server $Port --bind 127.0.0.1
}
finally {
  Pop-Location
}
