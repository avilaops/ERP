#!/usr/bin/env pwsh

Write-Host "🚀 Deploy ERP YOLO MODE" -ForegroundColor Cyan

# Commit e push
git add -A
git commit -m "chore: Deploy YOLO mode"
git push origin master

# Deploy Railway
railway up --detach

Write-Host "✅ Deploy iniciado!" -ForegroundColor Green
Write-Host "📊 Dashboard: https://railway.app/dashboard" -ForegroundColor Yellow
Write-Host "📝 Logs: railway logs" -ForegroundColor Yellow
