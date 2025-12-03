#!/usr/bin/env pwsh
# Deploy script for Avila ERP

Write-Host "🚀 ERP - Deploy Automation" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "📦 Checking Docker..." -ForegroundColor Yellow
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker not found! Please install Docker first." -ForegroundColor Red
    exit 1
}

# Check .env file
if (!(Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Please edit .env file with your configuration." -ForegroundColor Green
    exit 0
}

# Stop existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker-compose down

# Build frontend WASM
Write-Host "🔨 Building frontend WASM..." -ForegroundColor Yellow
cd frontend-wasm
.\build.ps1
cd ..

# Build Docker images
Write-Host "🐳 Building Docker images..." -ForegroundColor Yellow
docker-compose build

# Start containers
Write-Host "🚀 Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check health
Write-Host "🏥 Checking backend health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is healthy!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend health check failed!" -ForegroundColor Red
}

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "✅ Deploy completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Services running at:" -ForegroundColor Cyan
Write-Host "   Backend:  http://localhost:3000" -ForegroundColor White
Write-Host "   Frontend: http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "📊 View logs:" -ForegroundColor Cyan
Write-Host "   docker-compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "   docker-compose down" -ForegroundColor White
Write-Host ""
