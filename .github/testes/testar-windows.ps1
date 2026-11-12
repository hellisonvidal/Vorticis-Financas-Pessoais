# Testa os .exe gerados: instala o instalador em modo silencioso, abre o app e confere a interface;
# depois faz o mesmo com a versão portátil. Falha a compilação se algo não abrir.
$ErrorActionPreference = 'Stop'
$dist = Resolve-Path 'desktop/dist'
$pw = Join-Path $env:RUNNER_TEMP 'pw'
New-Item -ItemType Directory -Force $pw | Out-Null
Push-Location $pw; npm init -y | Out-Null; npm install playwright-core@1.49.1 --no-audit --no-fund | Out-Null; Pop-Location
Copy-Item .github/testes/abrir-app.js $pw

function Testar($nome, $exe, $porta) {
  Write-Host "== ${nome} -> ${exe}"
  Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$porta"
  node (Join-Path $pw 'abrir-app.js') $porta
  $ok = $LASTEXITCODE
  Get-Process | Where-Object { $_.Name -like 'Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 3
  $reg = Join-Path $env:APPDATA 'Finanças Pessoais\registro.txt'
  if (Test-Path $reg) { Write-Host '--- registro.txt ---'; Get-Content $reg -Tail 30 }
  if ($ok -ne 0) { throw "${nome} não abriu corretamente" }
  Write-Host "OK: ${nome} abriu corretamente"
}

$inst = Get-ChildItem "$dist\*Instalador*.exe" | Select-Object -First 1
$p = Start-Process -Wait -PassThru -FilePath $inst.FullName -ArgumentList '/S'
if ($p.ExitCode -ne 0) { throw "Instalador terminou com código $($p.ExitCode)" }
Get-Process | Where-Object { $_.Name -like 'Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
$exe = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter FinancasPessoais.exe | Select-Object -First 1
if (-not $exe) { throw 'Executável não encontrado após instalar' }
$lnk = Get-ChildItem "$env:USERPROFILE\Desktop", "$env:PUBLIC\Desktop" -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Finan*' }
Write-Host "Instalado em: $($exe.FullName) | atalho: $($lnk.Name)"
Testar 'Instalador' $exe.FullName 9333

$port = Get-ChildItem "$dist\*Portatil*.exe" | Select-Object -First 1
Testar 'Portátil' $port.FullName 9334

$un = Get-ChildItem $exe.DirectoryName -Filter 'Uninstall*.exe' | Select-Object -First 1
$p = Start-Process -Wait -PassThru -FilePath $un.FullName -ArgumentList '/S'
Start-Sleep 5
Write-Host "Desinstalador: código $($p.ExitCode); app removido: $(-not (Test-Path $exe.FullName)); dados mantidos: $(Test-Path (Join-Path $env:APPDATA 'Finanças Pessoais'))"
