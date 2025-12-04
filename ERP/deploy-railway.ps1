#!/usr/bin/env pwsh
# Deploy script para Railway.app - ERP YOLO Mode

Write-Host "🚀 Deploy ERP para Railway.app - YOLO MODE ATIVADO!" -ForegroundColor Cyan
Write-Host ""

# Verificar se está logado
Write-Host "📋 Verificando autenticação..." -ForegroundColor Yellow
$loginCheck = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Não está logado no Railway. Execute: railway login" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Logado como: $loginCheck" -ForegroundColor Green
Write-Host ""

# Commit mudanças se houver
Write-Host "📦 Verificando mudanças..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "📝 Commitando mudanças pendentes..." -ForegroundColor Yellow
    git add -A
    git commit -m "chore: Deploy YOLO mode to Railway"
    git push origin master
    Write-Host "✅ Mudanças commitadas e enviadas" -ForegroundColor Green
} else {
    Write-Host "✅ Nenhuma mudança pendente" -ForegroundColor Green
}
Write-Host ""

# Deploy
Write-Host "🚀 Iniciando deploy no Railway..." -ForegroundColor Cyan
Write-Host "⚡ YOLO MODE: Performance máxima ativada!" -ForegroundColor Yellow
Write-Host ""

# Deploy usando Railway CLI
railway up --detach

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deploy iniciado com sucesso!" -ForegroundColor Green
    Write-Host ""
    
    # Obter URL do deployment
    Write-Host "🌐 Obtendo URL do deployment..." -ForegroundColor Yellow
    $domain = railway domain 2>&1 | Out-String
    
    if ($domain -and $domain.Trim()) {
        Write-Host ""
        Write-Host "✅ Aplicação disponível em: https://$($domain.Trim())" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔗 Links úteis:" -ForegroundColor Cyan
        Write-Host "   - Dashboard: https://railway.app/dashboard" -ForegroundColor White
        Write-Host "   - API Health: https://$($domain.Trim())/api/v1/health" -ForegroundColor White
        Write-Host "   - Logs: railway logs" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "⚡ YOLO MODE CONFIG:" -ForegroundColor Yellow
    Write-Host "   - 32 worker threads" -ForegroundColor White
    Write-Host "   - 8GB cache" -ForegroundColor White
    Write-Host "   - fsync: OFF (⚠️  PERIGO!)" -ForegroundColor Red
    Write-Host "   - Direct I/O: ON" -ForegroundColor White
    Write-Host "   - Huge Pages: ON" -ForegroundColor White
    Write-Host "   - 500 concurrent streams" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Erro no deploy!" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Deploy concluído!" -ForegroundColor Green
