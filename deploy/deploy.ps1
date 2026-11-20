<#
.SYNOPSIS
  Publica a API do Brasil Dev Kit na VPS de efer.online.

.DESCRIPTION
  1. Roda lint, typecheck, testes e build localmente (pnpm run check).
  2. Envia o bundle, o Dockerfile, o Compose e a configuração do Nginx por scp.
  3. Executa deploy/remote-install.sh na VPS (backup, build, up, health check).
  4. Com -Nginx, instala/atualiza a rota /api/brasil-dev-kit/ (com backup e nginx -t).
  5. Confere a URL pública.

.EXAMPLE
  .\deploy\deploy.ps1            # só o app
  .\deploy\deploy.ps1 -Nginx     # app + rota no Nginx
#>
param(
  [switch]$Nginx,
  [switch]$SkipChecks,
  # Host SSH da VPS: parâmetro ou variável de ambiente local (nunca versionado).
  [string]$HostName = $env:BDK_DEPLOY_HOST,
  [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($HostName)) {
  throw 'Informe o host SSH da VPS com -HostName ou pela variável de ambiente BDK_DEPLOY_HOST.'
}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipChecks) {
  pnpm run check
  if ($LASTEXITCODE -ne 0) { throw 'pnpm run check falhou; deploy cancelado.' }
} else {
  pnpm run build
  if ($LASTEXITCODE -ne 0) { throw 'build falhou' }
}

$stage = "/tmp/brasil-dev-kit-deploy-$(Get-Date -Format yyyyMMddHHmmss)"
$target = "root@$HostName"
$files = @(
  'dist-server/server.js',
  'deploy/Dockerfile',
  'deploy/docker-compose.yml',
  'deploy/remote-install.sh',
  'deploy/nginx/brasil-dev-kit-http.conf',
  'deploy/nginx/brasil-dev-kit-location.conf',
  'site/index.html'
)

ssh -i $KeyPath $target "install -d -m 700 $stage"
if ($LASTEXITCODE -ne 0) { throw 'falha ao criar diretório temporário na VPS' }
scp -i $KeyPath @files "${target}:$stage/"
if ($LASTEXITCODE -ne 0) { throw 'falha no envio dos arquivos' }

$flag = if ($Nginx) { '--nginx' } else { '' }
ssh -i $KeyPath $target "bash $stage/remote-install.sh $stage $flag; rc=`$?; rm -rf $stage; exit `$rc"
if ($LASTEXITCODE -ne 0) { throw 'instalação remota falhou (veja a saída acima)' }

$health = Invoke-RestMethod -Uri 'https://efer.online/api/brasil-dev-kit/v1/health' -TimeoutSec 15
Write-Host "Público: status=$($health.status) versao=$($health.versao)"
