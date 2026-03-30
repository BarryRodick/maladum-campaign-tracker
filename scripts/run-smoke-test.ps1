param()

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = (Get-Command python).Source

Push-Location $root

try {
  $env:SE_AVOID_STATS = "true"
  & $python ".\tests\smoke_test.py"
  exit $LASTEXITCODE
}
finally {
  Remove-Item Env:SE_AVOID_STATS -ErrorAction SilentlyContinue
  Pop-Location
}
