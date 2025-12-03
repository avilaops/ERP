#!/usr/bin/env pwsh
# AvilaDB Build Script for Windows (PowerShell)
# Usage: .\build.ps1 [mode]
#   mode: debug | release | extreme | test | bench | clean

param(
    [Parameter(Position=0)]
    [ValidateSet('debug', 'release', 'extreme', 'test', 'bench', 'clean', 'all')]
    [string]$Mode = 'release',

    [switch]$Verbose,
    [switch]$Native
)

$ErrorActionPreference = "Stop"

# ========================================
# Constants & Configuration
# ========================================
$PROJECT_NAME = "AvilaDB"
$VERSION = "0.1.0"
$BANNER = @"
🇧🇷 $PROJECT_NAME v$VERSION - Build Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@

$CARGO_FEATURES = @{
    simd = "avx2,avx512"
    crypto = "secp256k1,schnorr"
}

# ========================================
# Helper Functions
# ========================================
function Write-Section {
    param([string]$Title)
    Write-Host "`n📦 $Title" -ForegroundColor Cyan
    Write-Host ("─" * 50) -ForegroundColor DarkGray
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Yellow
}

function Check-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-CPUFeatures {
    try {
        # Windows: usa WMIC
        $cpu = Get-WmiObject -Class Win32_Processor | Select-Object -First 1
        $features = @()

        # Detecta AVX2 (presente em CPUs >= Haswell 2013)
        if ($cpu.Description -match "Intel|AMD") {
            $features += "AVX2 (assumed)"
        }

        return $features -join ", "
    } catch {
        return "Unknown"
    }
}

# ========================================
# Build Functions
# ========================================
function Build-Debug {
    Write-Section "Building in DEBUG mode"
    Write-Info "Symbols de debug incluídos, sem otimizações"

    cargo build --workspace
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Debug build completed: .\target\debug\aviladb.exe"
    } else {
        Write-Error "Debug build failed"
        exit 1
    }
}

function Build-Release {
    Write-Section "Building in RELEASE mode"
    Write-Info "Otimizações completas, stripped binary"

    $env:RUSTFLAGS = "-C opt-level=3"

    if ($Native) {
        $env:RUSTFLAGS += " -C target-cpu=native"
        Write-Info "Native CPU optimizations enabled"
    }

    cargo build --release --workspace
    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item ".\target\release\aviladb.exe").Length / 1MB
        Write-Success "Release build completed: .\target\release\aviladb.exe ($([math]::Round($size, 2)) MB)"
    } else {
        Write-Error "Release build failed"
        exit 1
    }
}

function Build-Extreme {
    Write-Section "Building in EXTREME mode"
    Write-Info "⚠️  Binário otimizado para CPU atual - NÃO portável!"

    $cpuFeatures = Get-CPUFeatures
    Write-Info "CPU Features: $cpuFeatures"

    cargo build --profile extreme --workspace
    if ($LASTEXITCODE -eq 0) {
        $size = (Get-Item ".\target\extreme\aviladb.exe").Length / 1MB
        Write-Success "Extreme build completed: .\target\extreme\aviladb.exe ($([math]::Round($size, 2)) MB)"
        Write-Info "⚡ Performance esperada: 15-30% mais rápido que release"
    } else {
        Write-Error "Extreme build failed"
        exit 1
    }
}

function Run-Tests {
    Write-Section "Running Tests"

    $testArgs = @("test", "--workspace")
    if ($Verbose) {
        $testArgs += "--", "--nocapture", "--test-threads=1"
    }

    & cargo @testArgs
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All tests passed! ✨"
    } else {
        Write-Error "Tests failed"
        exit 1
    }
}

function Run-Benchmarks {
    Write-Section "Running Benchmarks"
    Write-Info "Requer 'cargo bench' (nightly ou criterion)"

    if (-not (Test-Path ".\benches")) {
        Write-Info "Criando estrutura de benchmarks..."
        New-Item -ItemType Directory -Path ".\benches" -Force | Out-Null
    }

    cargo bench --workspace
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Benchmarks completed"
        Write-Info "Resultados em: .\target\criterion\report\index.html"
    } else {
        Write-Error "Benchmarks failed (pode não estar implementado ainda)"
    }
}

function Clean-Build {
    Write-Section "Cleaning build artifacts"

    if (Test-Path ".\target") {
        $size = (Get-ChildItem ".\target" -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
        Write-Info "Removendo $([math]::Round($size, 2)) GB de artifacts..."
        Remove-Item ".\target" -Recurse -Force
    }

    cargo clean
    Write-Success "Workspace cleaned"
}

function Build-All {
    Write-Section "Building ALL configurations"
    Build-Debug
    Build-Release
    Build-Extreme
    Run-Tests
    Write-Success "All builds completed! 🎉"
}

# ========================================
# Pre-flight Checks
# ========================================
function Check-Environment {
    Write-Host $BANNER
    Write-Section "Environment Check"

    # Check Rust
    if (-not (Check-Command "cargo")) {
        Write-Error "Cargo não encontrado! Instale Rust: https://rustup.rs"
        exit 1
    }

    $rustVersion = (cargo --version) -replace 'cargo ', ''
    Write-Success "Cargo: $rustVersion"

    # Check rustc
    $rustcVersion = (rustc --version) -replace 'rustc ', ''
    Write-Success "Rustc: $rustcVersion"

    # Check CPU
    $cpuName = (Get-WmiObject -Class Win32_Processor | Select-Object -First 1).Name
    Write-Info "CPU: $cpuName"
    Write-Info "Features: $(Get-CPUFeatures)"

    # Check disk space
    $drive = (Get-Location).Drive
    $freeSpace = (Get-PSDrive $drive.Name).Free / 1GB
    if ($freeSpace -lt 5) {
        Write-Error "Espaço em disco baixo: $([math]::Round($freeSpace, 2)) GB disponível"
        Write-Info "Build requer ~5GB de espaço"
    } else {
        Write-Success "Disk space: $([math]::Round($freeSpace, 2)) GB free"
    }

    Write-Host ""
}

# ========================================
# Main Execution
# ========================================
function Main {
    Check-Environment

    $startTime = Get-Date

    switch ($Mode) {
        'debug'   { Build-Debug }
        'release' { Build-Release }
        'extreme' { Build-Extreme }
        'test'    { Run-Tests }
        'bench'   { Run-Benchmarks }
        'clean'   { Clean-Build }
        'all'     { Build-All }
        default   { Build-Release }
    }

    $elapsed = (Get-Date) - $startTime
    Write-Host "`n⏱️  Tempo total: $($elapsed.ToString('mm\:ss'))" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray
}

# ========================================
# Entry Point
# ========================================
try {
    Main
} catch {
    Write-Error "Build script failed: $_"
    exit 1
}
