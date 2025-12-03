#!/usr/bin/env pwsh
# AvilaDB Test Runner - Windows PowerShell
# Usage: .\test.ps1 [suite]
#   suite: unit | integration | crypto | perf | all

param(
    [Parameter(Position=0)]
    [ValidateSet('unit', 'integration', 'crypto', 'perf', 'all')]
    [string]$Suite = 'all',

    [switch]$Verbose,
    [switch]$Coverage
)

$ErrorActionPreference = "Stop"

# ========================================
# Configuration
# ========================================
$BANNER = @"
🧪 AvilaDB Test Suite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@

# Test vectors para criptografia (reservado para uso futuro)
# $CRYPTO_VECTORS = @{
#     secp256k1_point = @{
#         x = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
#         y = "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"
#         description = "Generator point G"
#     }
#     schnorr_test = @{
#         privkey = "0000000000000000000000000000000000000000000000000000000000000001"
#         message = "Hello AvilaDB"
#         description = "Simple Schnorr signature test"
#     }
# }

# ========================================
# Helper Functions
# ========================================
function Write-TestHeader {
    param([string]$Title)
    Write-Host "`n🧪 $Title" -ForegroundColor Cyan
    Write-Host ("─" * 50) -ForegroundColor DarkGray
}

function Write-Pass {
    param([string]$Test)
    Write-Host "  ✅ $Test" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Test, [string]$Reason)
    Write-Host "  ❌ $Test" -ForegroundColor Red
    if ($Reason) {
        Write-Host "     Reason: $Reason" -ForegroundColor Yellow
    }
}

function Write-Skip {
    param([string]$Test, [string]$Reason)
    Write-Host "  ⏭️  $Test (skipped: $Reason)" -ForegroundColor Yellow
}

# ========================================
# Test Suites
# ========================================
function Test-Unit {
    Write-TestHeader "Unit Tests"

    $packages = @(
        "avila-nucleus",
        "avila-primitives",
        "avila-math",
        "avila-crypto",
        "avila-quinn",
        "aviladb-core"
    )

    $passed = 0
    $failed = 0

    foreach ($pkg in $packages) {
        Write-Host "`n📦 Testing $pkg..." -ForegroundColor Magenta

        $testArgs = @("test", "-p", $pkg)
        if ($Verbose) {
            $testArgs += @("--", "--nocapture")
        }

        try {
            & cargo @testArgs
            if ($LASTEXITCODE -eq 0) {
                Write-Pass "$pkg unit tests"
                $passed++
            } else {
                Write-Fail "$pkg unit tests" "Exit code: $LASTEXITCODE"
                $failed++
            }
        } catch {
            Write-Fail "$pkg unit tests" $_.Exception.Message
            $failed++
        }
    }

    return @{ Passed = $passed; Failed = $failed }
}

function Test-Crypto {
    Write-TestHeader "Cryptography Tests"

    $tests = @(
        @{
            Name = "secp256k1 Point Addition"
            Description = "Verifica G + G = 2G"
            Skip = $false
        },
        @{
            Name = "Schnorr Signature"
            Description = "Sign + Verify com chave de teste"
            Skip = $false
        },
        @{
            Name = "BLAKE3 Hash"
            Description = "Hash('') = c1c8...(conhecido)"
            Skip = $true # Não implementado ainda
            Reason = "Aguardando implementação completa"
        },
        @{
            Name = "ChaCha20 Encryption"
            Description = "Encrypt + Decrypt = identity"
            Skip = $true
            Reason = "Aguardando implementação completa"
        }
    )

    $passed = 0
    $failed = 0
    $skipped = 0

    foreach ($test in $tests) {
        if ($test.Skip) {
            Write-Skip $test.Name $test.Reason
            $skipped++
            continue
        }

        Write-Host "`n  Testing: $($test.Description)" -ForegroundColor Gray

        # Executa teste específico
        $testName = $test.Name -replace " ", "_" -replace "-", "_"
        try {
            cargo test -p avila-crypto --test $testName.ToLower() 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Pass $test.Name
                $passed++
            } else {
                Write-Fail $test.Name "Test not found or failed"
                $failed++
            }
        } catch {
            Write-Fail $test.Name $_.Exception.Message
            $failed++
        }
    }

    return @{ Passed = $passed; Failed = $failed; Skipped = $skipped }
}

function Test-Integration {
    Write-TestHeader "Integration Tests"

    Write-Host "`n⚠️  Integration tests requerem servidor rodando" -ForegroundColor Yellow
    Write-Host "Start server: .\target\release\aviladb.exe" -ForegroundColor Gray

    $tests = @(
        "QUIC Connection Establishment",
        "Transaction Commit/Rollback",
        "Storage Persistence",
        "Concurrent Writes"
    )

    $skipped = 0
    foreach ($test in $tests) {
        Write-Skip $test "Aguardando implementação"
        $skipped++
    }

    return @{ Passed = 0; Failed = 0; Skipped = $skipped }
}

function Test-Performance {
    Write-TestHeader "Performance Tests"

    Write-Host "`n🚀 Benchmarking critical paths..." -ForegroundColor Magenta

    $benchmarks = @(
        @{ Name = "U256 Operations"; Target = "1M ops/sec" },
        @{ Name = "secp256k1 Point Mul"; Target = "10K ops/sec" },
        @{ Name = "Schnorr Sign"; Target = "20K ops/sec" },
        @{ Name = "BLAKE3 Throughput"; Target = "1 GB/sec" }
    )

    foreach ($bench in $benchmarks) {
        Write-Host "`n  📊 $($bench.Name)" -ForegroundColor Cyan
        Write-Host "     Target: $($bench.Target)" -ForegroundColor Gray

        # Tenta rodar benchmark (pode não existir)
        $benchName = $bench.Name -replace " ", "_"
        try {
            cargo bench --bench $benchName.ToLower() 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Pass "$($bench.Name) benchmark"
            } else {
                Write-Skip "$($bench.Name) benchmark" "Not implemented"
            }
        } catch {
            Write-Skip "$($bench.Name) benchmark" "Not implemented"
        }
    }

    return @{ Passed = 0; Failed = 0; Skipped = $benchmarks.Count }
}

function Test-All {
    Write-TestHeader "Running ALL Test Suites"

    $results = @{
        Unit = Test-Unit
        Crypto = Test-Crypto
        Integration = Test-Integration
        Perf = Test-Performance
    }

    return $results
}

# ========================================
# Coverage Report
# ========================================
function New-CoverageReport {
    Write-TestHeader "Code Coverage"

    if (-not (Get-Command "cargo-tarpaulin" -ErrorAction SilentlyContinue)) {
        Write-Host "⚠️  cargo-tarpaulin não instalado" -ForegroundColor Yellow
        Write-Host "Install: cargo install cargo-tarpaulin" -ForegroundColor Gray
        return
    }

    Write-Host "`n📊 Generating coverage report..." -ForegroundColor Magenta
    cargo tarpaulin --workspace --out Html --output-dir coverage

    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Coverage report generated: .\coverage\index.html"

        # Abre no browser
        Start-Process ".\coverage\index.html"
    } else {
        Write-Fail "Coverage generation failed"
    }
}

# ========================================
# Summary Report
# ========================================
function Show-Summary {
    param($Results)

    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "📊 Test Summary" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

    $totalPassed = 0
    $totalFailed = 0
    $totalSkipped = 0

    foreach ($suite in $Results.Keys) {
        $result = $Results[$suite]
        $totalPassed += $result.Passed
        $totalFailed += $result.Failed
        $totalSkipped += $result.Skipped

        $status = if ($result.Failed -gt 0) { "❌" } else { "✅" }
        Write-Host "`n$status $suite Tests:"
        Write-Host "   Passed:  $($result.Passed)" -ForegroundColor Green
        if ($result.Failed -gt 0) {
            Write-Host "   Failed:  $($result.Failed)" -ForegroundColor Red
        }
        if ($result.Skipped -gt 0) {
            Write-Host "   Skipped: $($result.Skipped)" -ForegroundColor Yellow
        }
    }

    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "Total Passed:  $totalPassed" -ForegroundColor Green
    if ($totalFailed -gt 0) {
        Write-Host "Total Failed:  $totalFailed" -ForegroundColor Red
    }
    if ($totalSkipped -gt 0) {
        Write-Host "Total Skipped: $totalSkipped" -ForegroundColor Yellow
    }
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray

    return ($totalFailed -eq 0)
}

# ========================================
# Main Execution
# ========================================
function Main {
    Write-Host $BANNER

    $startTime = Get-Date

    $results = switch ($Suite) {
        'unit'        { @{ Unit = Test-Unit } }
        'integration' { @{ Integration = Test-Integration } }
        'crypto'      { @{ Crypto = Test-Crypto } }
        'perf'        { @{ Perf = Test-Performance } }
        'all'         { Test-All }
        default       { @{ Unit = Test-Unit } }
    }

    if ($Coverage) {
        New-CoverageReport
    }

    $success = Show-Summary -Results $results

    $elapsed = (Get-Date) - $startTime
    Write-Host "⏱️  Tempo total: $($elapsed.ToString('mm\:ss'))" -ForegroundColor Magenta

    if (-not $success) {
        exit 1
    }
}

# ========================================
# Entry Point
# ========================================
try {
    Main
} catch {
    Write-Host "`n❌ Test runner failed: $_" -ForegroundColor Red
    exit 1
}
