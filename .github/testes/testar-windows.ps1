# Testa os .exe gerados: instala o instalador em modo silencioso, abre o app e confere a interface;
# depois faz o mesmo com a versão portátil. Falha a compilação se algo não abrir.
$ErrorActionPreference = 'Stop'
$dist = Resolve-Path 'desktop/dist'
$pw = Join-Path $env:RUNNER_TEMP 'pw'
New-Item -ItemType Directory -Force $pw | Out-Null
Push-Location $pw; npm init -y | Out-Null; npm install playwright-core@1.49.1 --no-audit --no-fund | Out-Null; Pop-Location
Copy-Item .github/testes/abrir-app.js $pw

function Testar($nome, $exe, $porta, $modo) {
  Write-Host "== ${nome} -> ${exe}"
  Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$porta"
  node (Join-Path $pw 'abrir-app.js') $porta $modo
  $ok = $LASTEXITCODE
  Get-Process | Where-Object { $_.Name -like 'Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 3
  $reg = Join-Path $env:APPDATA 'FinancasPessoais\registro.txt'
  if (Test-Path $reg) { Write-Host '--- registro.txt ---'; Get-Content $reg -Tail 30 }
  if ($ok -ne 0) { throw "${nome} não abriu corretamente" }
  Write-Host "OK: ${nome} abriu corretamente"
}

# --- Versão anterior (1.0.6, pasta de dados com acento): grava um dado para testar a migração ---
$antigoOk = $false
try {
  $old = Join-Path $env:RUNNER_TEMP 'antiga'; New-Item -ItemType Directory -Force $old | Out-Null
  gh release download v1.0.6 -R $env:GITHUB_REPOSITORY -p '*Portatil*' -D $old --clobber
  $oldExe = Get-ChildItem "$old\*.exe" | Select-Object -First 1
  Start-Process -FilePath $oldExe.FullName -ArgumentList '--remote-debugging-port=9336'
  $saida = node (Join-Path $pw 'abrir-app.js') 9336 'antigo'
  Write-Host $saida
  $antigoOk = ($saida -join ' ') -match 'VERSAO_ANTIGA_IDB=ok'
  Get-Process | Where-Object { $_.Name -like 'Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 3
  Write-Host "Versão 1.0.6: banco local funcionava no Windows = $antigoOk"
} catch { Write-Host "Aviso: não foi possível testar a versão anterior: $_" }

$inst = Get-ChildItem "$dist\*Instalador*.exe" | Select-Object -First 1
$p = Start-Process -Wait -PassThru -FilePath $inst.FullName -ArgumentList '/S'
if ($p.ExitCode -ne 0) { throw "Instalador terminou com código $($p.ExitCode)" }
Get-Process | Where-Object { $_.Name -like 'Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
$exe = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter FinancasPessoais.exe | Select-Object -First 1
if (-not $exe) { throw 'Executável não encontrado após instalar' }
$lnk = Get-ChildItem "$env:USERPROFILE\Desktop", "$env:PUBLIC\Desktop" -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Finan*' }
Write-Host "Instalado em: $($exe.FullName) | atalho: $($lnk.Name)"
Testar 'Instalador (grava um dado)' $exe.FullName 9333 'gravar'
Testar 'Instalador reaberto (dado continua lá)' $exe.FullName 9333 'conferir'
if ($antigoOk) { Testar 'Migração dos dados da versão 1.0.6' $exe.FullName 9333 'migracao' }

$port = Get-ChildItem "$dist\*Portatil*.exe" | Select-Object -First 1
Testar 'Portátil (mesmos dados do instalador)' $port.FullName 9334 'conferir'

$un = Get-ChildItem $exe.DirectoryName -Filter 'Uninstall*.exe' | Select-Object -First 1
$p = Start-Process -Wait -PassThru -FilePath $un.FullName -ArgumentList '/S'
Start-Sleep 5
Write-Host "Desinstalador: código $($p.ExitCode); app removido: $(-not (Test-Path $exe.FullName)); dados mantidos: $(Test-Path (Join-Path $env:APPDATA 'FinancasPessoais'))"
