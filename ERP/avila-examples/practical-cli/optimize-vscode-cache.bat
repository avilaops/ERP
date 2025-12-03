@echo off
REM ============================================
REM OPTIMIZE-VSCODE-CACHE.BAT
REM ============================================
REM Executa o script PowerShell de limpeza
REM
REM COMO USAR:
REM 1. Feche o VS Code completamente
REM 2. Clique com botão direito neste arquivo
REM 3. Selecione "Executar como administrador"

echo.
echo ============================================
echo   OTIMIZADOR DE CACHE DO VS CODE
echo ============================================
echo.

REM Verifica se está executando como Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] Este script precisa ser executado como Administrador!
    echo.
    echo Clique com botao direito no arquivo e selecione:
    echo "Executar como administrador"
    echo.
    pause
    exit /b 1
)

echo [OK] Executando como Administrador
echo.

REM Executa o script PowerShell
powershell.exe -ExecutionPolicy Bypass -File "%~dp0optimize-vscode-cache.ps1"

echo.
pause
