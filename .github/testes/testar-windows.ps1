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
  Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
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
  Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 3
  Write-Host "Versão 1.0.6: banco local funcionava no Windows = $antigoOk"
} catch { Write-Host "Aviso: não foi possível testar a versão anterior: $_" }

function Instalar($arquivo) {
  # o instalador às vezes falha de forma esporádica nas máquinas do GitHub; tenta até 3 vezes
  for ($t = 1; $t -le 3; $t++) {
    Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    $p = Start-Process -Wait -PassThru -FilePath $arquivo -ArgumentList '/S'
    if ($p.ExitCode -eq 0) { break }
    Write-Host "Aviso: instalador terminou com código $($p.ExitCode) (tentativa $t)"
    if ($t -eq 3) { throw "Instalador terminou com código $($p.ExitCode)" }
  }
  Start-Sleep 3
  Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
}
$atalhos = { Get-ChildItem "$env:USERPROFILE\Desktop", "$env:PUBLIC\Desktop" -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*Finan*' } }

# --- Versão anterior instalada (1.0.17, ainda com o nome antigo): a nova deve atualizar por cima ---
$antigaInstalada = $false
try {
  $oi = Join-Path $env:RUNNER_TEMP 'instalador-antigo'; New-Item -ItemType Directory -Force $oi | Out-Null
  gh release download v1.0.17 -R $env:GITHUB_REPOSITORY -p '*Instalador*.exe' -D $oi --clobber
  Instalar (Get-ChildItem "$oi\*.exe" | Select-Object -First 1).FullName
  $velho = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter FinancasPessoais.exe | Select-Object -First 1
  $antigaInstalada = [bool]$velho
  Write-Host "Versão 1.0.17 instalada: $antigaInstalada ($($velho.FullName)) | atalhos: $((& $atalhos).Name -join ', ')"
} catch { Write-Host "Aviso: não foi possível instalar a versão 1.0.17: $_" }

$inst = Get-ChildItem "$dist\*Instalador*.exe" | Select-Object -First 1
Instalar $inst.FullName
$exe = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter VorticisFinancasPessoais.exe | Select-Object -First 1
if (-not $exe) { throw 'Executável não encontrado após instalar' }
$lnk = & $atalhos
Write-Host "Instalado em: $($exe.FullName) | atalhos: $($lnk.Name -join ', ')"
if (-not ($lnk | Where-Object { $_.Name -eq 'Vorticis Finanças Pessoais.lnk' })) { throw 'Atalho "Vorticis Finanças Pessoais" não foi criado' }
if ($antigaInstalada) {
  $restos = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter FinancasPessoais.exe -ErrorAction SilentlyContinue
  $atalhoVelho = $lnk | Where-Object { $_.Name -eq 'Finanças Pessoais.lnk' }
  Write-Host "Atualização sobre a 1.0.17: executável antigo restante = $([bool]$restos) | atalho antigo restante = $([bool]$atalhoVelho)"
  if ($restos -or $atalhoVelho) { throw 'A versão antiga não foi substituída corretamente' }
  Write-Host 'OK: a nova versão substituiu a 1.0.17 (nome antigo)'
}
Testar 'Instalador (grava um dado)' $exe.FullName 9333 'gravar'
Testar 'Instalador reaberto (dado continua lá)' $exe.FullName 9333 'conferir'
if ($antigoOk) { Testar 'Migração dos dados da versão 1.0.6' $exe.FullName 9333 'migracao' }

$port = Get-ChildItem "$dist\*Portatil*.exe" | Select-Object -First 1
Testar 'Portátil (mesmos dados do instalador)' $port.FullName 9334 'conferir'

# --- Atualização dentro do app: simula uma versão 9.9.9 num servidor local ---
$yml = Join-Path $dist 'latest.yml'
if (-not (Test-Path $yml)) { throw 'latest.yml não foi gerado (necessário para a atualização automática)' }
Write-Host '--- latest.yml ---'; Get-Content $yml
$upd = Join-Path $env:RUNNER_TEMP 'upd'; New-Item -ItemType Directory -Force $upd | Out-Null
Copy-Item $inst.FullName $upd
(Get-Content $yml) -replace '^version: .*$', 'version: 9.9.9' | Set-Content (Join-Path $upd 'latest.yml') -Encoding utf8
$portName = 'VorticisFinancasPessoais-Portatil-9.9.9.exe'
Copy-Item $port.FullName (Join-Path $upd $portName)
$rel = @{ tag_name = 'v9.9.9'; body = 'Versão de teste'; assets = @(@{ name = $portName; size = (Get-Item (Join-Path $upd $portName)).Length; browser_download_url = "http://127.0.0.1:8765/$portName" }) } | ConvertTo-Json -Depth 5
Set-Content (Join-Path $upd 'release.json') $rel -Encoding utf8
$srv = Start-Process -PassThru -FilePath python -ArgumentList '-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', $upd
Start-Sleep 3

# portátil: baixa a nova versão para a própria pasta
$ptest = Join-Path $env:RUNNER_TEMP 'portatil-teste'; New-Item -ItemType Directory -Force $ptest | Out-Null
Copy-Item $port.FullName $ptest
$env:FP_RELEASES_URL = 'http://127.0.0.1:8765/release.json'
Start-Process -FilePath (Join-Path $ptest $port.Name) -ArgumentList '--remote-debugging-port=9337'
node (Join-Path $pw 'abrir-app.js') 9337 'atualizar-portatil'
$okP = $LASTEXITCODE
Remove-Item Env:FP_RELEASES_URL
Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 3
$baixado = Join-Path $ptest $portName
Write-Host "Portátil: novo arquivo baixado = $(Test-Path $baixado) ($((Get-Item $baixado -ErrorAction SilentlyContinue).Length) bytes)"
if ($okP -ne 0 -or -not (Test-Path $baixado)) { throw 'Atualização da versão portátil falhou' }
Write-Host 'OK: atualização da versão portátil'

# instalado: verifica, baixa (confere SHA-512), fecha e roda o instalador
$env:FP_UPDATE_URL = 'http://127.0.0.1:8765/'
Start-Process -FilePath $exe.FullName -ArgumentList '--remote-debugging-port=9333'
node (Join-Path $pw 'abrir-app.js') 9333 'atualizar'
$okI = $LASTEXITCODE
Remove-Item Env:FP_UPDATE_URL
if ($okI -ne 0) { throw 'Atualização da versão instalada falhou' }
Start-Sleep 25
$reaberto = Get-Process | Where-Object { $_.Name -like '*FinancasPessoais*' }
Write-Host "Instalador da atualização executado; app reaberto depois: $([bool]$reaberto)"
$reg = Join-Path $env:APPDATA 'FinancasPessoais\registro.txt'
if (Test-Path $reg) { Get-Content $reg -Tail 15 }
if (-not $reaberto) { throw 'O app não reabriu depois de instalar a atualização' }
Write-Host 'OK: atualização da versão instalada'
Get-Process | Where-Object { $_.Name -like '*Financas*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
Start-Sleep 3

$un = Get-ChildItem $exe.DirectoryName -Filter 'Uninstall*.exe' | Select-Object -First 1
$p = Start-Process -Wait -PassThru -FilePath $un.FullName -ArgumentList '/S'
Start-Sleep 5
Write-Host "Desinstalador: código $($p.ExitCode); app removido: $(-not (Test-Path $exe.FullName)); dados mantidos: $(Test-Path (Join-Path $env:APPDATA 'FinancasPessoais'))"
