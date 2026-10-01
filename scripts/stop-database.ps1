$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL-17.11\pgsql"
$dataDirectory = Join-Path $PSScriptRoot "..\.local\postgres-data"
$pgControl = Join-Path $postgresRoot "bin\pg_ctl.exe"

if (-not (Test-Path -LiteralPath $pgControl)) {
  throw "PostgreSQL не найден: $pgControl"
}

& $pgControl -D $dataDirectory stop
