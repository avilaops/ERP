# Build do Frontend WASM
Write-Host "🦀 Compilando Frontend Rust para WebAssembly..." -ForegroundColor Cyan

# Verificar se wasm-pack está instalado
if (!(Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
    Write-Host "❌ wasm-pack não encontrado. Instalando..." -ForegroundColor Yellow
    cargo install wasm-pack
}

# Build
wasm-pack build --target web --out-dir pkg

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build concluído com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para executar:" -ForegroundColor Yellow
    Write-Host "  python -m http.server 8000" -ForegroundColor White
    Write-Host "  ou" -ForegroundColor White
    Write-Host "  npx http-server -p 8000" -ForegroundColor White
    Write-Host ""
    Write-Host "Depois abra: http://localhost:8000" -ForegroundColor Cyan
} else {
    Write-Host "❌ Erro no build!" -ForegroundColor Red
    exit 1
}
