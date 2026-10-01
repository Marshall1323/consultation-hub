$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL-17.11\pgsql"
$dataDirectory = Join-Path $PSScriptRoot "..\.local\postgres-data"
$logFile = Join-Path $PSScriptRoot "..\.local\postgres.log"
$pgControl = Join-Path $postgresRoot "bin\pg_ctl.exe"

if (-not (Test-Path -LiteralPath $pgControl)) {
  throw "PostgreSQL не найден: $pgControl"
}

& $pgControl -D $dataDirectory -l $logFile -o "-p 5432" start
