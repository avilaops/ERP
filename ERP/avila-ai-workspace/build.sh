#!/usr/bin/env bash
# AvilaDB Build Script for Linux/macOS
# Usage: ./build.sh [mode]
#   mode: debug | release | extreme | test | bench | clean | all

set -euo pipefail

# ========================================
# Constants & Configuration
# ========================================
PROJECT_NAME="AvilaDB"
VERSION="0.1.0"
BANNER="🇧🇷 $PROJECT_NAME v$VERSION - Build Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# ========================================
# Helper Functions
# ========================================
write_section() {
    echo -e "\n${CYAN}📦 $1${NC}"
    echo -e "${GRAY}──────────────────────────────────────────────────${NC}"
}

write_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

write_error() {
    echo -e "${RED}❌ $1${NC}"
}

write_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

get_cpu_features() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        grep -oP '(avx2|avx512)' /proc/cpuinfo | sort -u | tr '\n' ' '
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        sysctl -a | grep machdep.cpu.features | grep -oE '(AVX2|AVX512)' || echo "AVX2 (assumed)"
    else
        echo "Unknown"
    fi
}

get_cpu_name() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        sysctl -n machdep.cpu.brand_string
    else
        echo "Unknown CPU"
    fi
}

# ========================================
# Build Functions
# ========================================
build_debug() {
    write_section "Building in DEBUG mode"
    write_info "Symbols de debug incluídos, sem otimizações"

    cargo build --workspace
    write_success "Debug build completed: ./target/debug/aviladb"
}

build_release() {
    write_section "Building in RELEASE mode"
    write_info "Otimizações completas, stripped binary"

    export RUSTFLAGS="-C opt-level=3"

    if [[ "${NATIVE:-0}" == "1" ]]; then
        export RUSTFLAGS="$RUSTFLAGS -C target-cpu=native"
        write_info "Native CPU optimizations enabled"
    fi

    cargo build --release --workspace

    local size=$(du -h ./target/release/aviladb | cut -f1)
    write_success "Release build completed: ./target/release/aviladb ($size)"
}

build_extreme() {
    write_section "Building in EXTREME mode"
    write_info "⚠️  Binário otimizado para CPU atual - NÃO portável!"

    local cpu_features=$(get_cpu_features)
    write_info "CPU Features: $cpu_features"

    cargo build --profile extreme --workspace

    local size=$(du -h ./target/extreme/aviladb | cut -f1)
    write_success "Extreme build completed: ./target/extreme/aviladb ($size)"
    write_info "⚡ Performance esperada: 15-30% mais rápido que release"
}

run_tests() {
    write_section "Running Tests"

    local test_args=(test --workspace)
    if [[ "${VERBOSE:-0}" == "1" ]]; then
        test_args+=(-- --nocapture --test-threads=1)
    fi

    cargo "${test_args[@]}"
    write_success "All tests passed! ✨"
}

run_benchmarks() {
    write_section "Running Benchmarks"
    write_info "Requer 'cargo bench' (nightly ou criterion)"

    if [[ ! -d "./benches" ]]; then
        write_info "Criando estrutura de benchmarks..."
        mkdir -p ./benches
    fi

    cargo bench --workspace || {
        write_error "Benchmarks failed (pode não estar implementado ainda)"
        return 1
    }

    write_success "Benchmarks completed"
    write_info "Resultados em: ./target/criterion/report/index.html"
}

clean_build() {
    write_section "Cleaning build artifacts"

    if [[ -d "./target" ]]; then
        local size=$(du -sh ./target | cut -f1)
        write_info "Removendo $size de artifacts..."
        rm -rf ./target
    fi

    cargo clean
    write_success "Workspace cleaned"
}

build_all() {
    write_section "Building ALL configurations"
    build_debug
    build_release
    build_extreme
    run_tests
    write_success "All builds completed! 🎉"
}

# ========================================
# Pre-flight Checks
# ========================================
check_environment() {
    echo "$BANNER"
    write_section "Environment Check"

    # Check Rust
    if ! check_command cargo; then
        write_error "Cargo não encontrado! Instale Rust: https://rustup.rs"
        exit 1
    fi

    local rust_version=$(cargo --version | sed 's/cargo //')
    write_success "Cargo: $rust_version"

    # Check rustc
    local rustc_version=$(rustc --version | sed 's/rustc //')
    write_success "Rustc: $rustc_version"

    # Check CPU
    local cpu_name=$(get_cpu_name)
    write_info "CPU: $cpu_name"
    write_info "Features: $(get_cpu_features)"

    # Check disk space
    local free_space=$(df -h . | awk 'NR==2 {print $4}')
    write_success "Disk space: $free_space free"

    # Check for sccache (optional accelerator)
    if check_command sccache; then
        export RUSTC_WRAPPER=sccache
        write_info "sccache enabled (faster builds)"
    fi

    echo ""
}

# ========================================
# Main Execution
# ========================================
main() {
    local mode="${1:-release}"

    check_environment

    local start_time=$(date +%s)

    case "$mode" in
        debug)
            build_debug
            ;;
        release)
            build_release
            ;;
        extreme)
            build_extreme
            ;;
        test)
            run_tests
            ;;
        bench)
            run_benchmarks
            ;;
        clean)
            clean_build
            ;;
        all)
            build_all
            ;;
        *)
            write_error "Unknown mode: $mode"
            echo "Usage: $0 {debug|release|extreme|test|bench|clean|all}"
            exit 1
            ;;
    esac

    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))

    echo -e "\n⏱️  Tempo total: ${minutes}m ${seconds}s"
    echo -e "${GRAY}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# ========================================
# Entry Point
# ========================================
main "$@"
