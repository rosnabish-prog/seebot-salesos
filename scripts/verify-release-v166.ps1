$ErrorActionPreference = 'Stop'
Write-Host 'SalesOS v1.6.6 preflight — staging only'
if (!(Test-Path 'node_modules')) {throw 'Node dependencies missing. Install from your approved lockfile first.'}
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) {throw 'Typecheck failed.'}
npm.cmd run test
if ($LASTEXITCODE -ne 0) {throw 'Tests failed.'}
npm.cmd run build
if ($LASTEXITCODE -ne 0) {throw 'Build failed.'}
Write-Host 'Build checks passed; database migrations, tenant isolation and integration checks still require independent execution.'
