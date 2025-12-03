# AvilaDB Makefile
# Wrapper para scripts de build e teste
# Funciona em Windows (com Make instalado) e Linux/macOS

.PHONY: help build debug release extreme test test-unit test-crypto bench clean install run dev docs check format lint

# Default target
.DEFAULT_GOAL := help

# Detecta sistema operacional
ifeq ($(OS),Windows_NT)
    DETECTED_OS := Windows
    SHELL_EXT := .ps1
    SHELL_CMD := pwsh
    EXE_EXT := .exe
else
    DETECTED_OS := $(shell uname -s)
    SHELL_EXT := .sh
    SHELL_CMD := bash
    EXE_EXT :=
endif

# Colors para output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
CYAN := \033[0;36m
NC := \033[0m # No Color

##@ General

help: ## Mostra esta mensagem de ajuda
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "🇧🇷 AvilaDB - Makefile Commands"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "Detected OS: $(DETECTED_OS)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_-]+:.*?##/ { printf "  $(CYAN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Build Commands

build: release ## Alias para 'release' (build otimizado)

debug: ## Build em modo debug (símbolos, sem otimizações)
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\build$(SHELL_EXT) debug
else
	@$(SHELL_CMD) ./build$(SHELL_EXT) debug
endif

release: ## Build em modo release (otimizações completas)
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\build$(SHELL_EXT) release
else
	@$(SHELL_CMD) ./build$(SHELL_EXT) release
endif

extreme: ## Build extremo (CPU-specific, máxima performance)
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\build$(SHELL_EXT) extreme
else
	@$(SHELL_CMD) ./build$(SHELL_EXT) extreme
endif

native: ## Build release com otimizações para CPU nativa
ifeq ($(DETECTED_OS),Windows)
	@powershell -Command "$$env:NATIVE='1'; .\build.ps1 release"
else
	@NATIVE=1 ./build.sh release
endif

all: ## Build todas as configurações (debug + release + extreme)
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\build$(SHELL_EXT) all
else
	@$(SHELL_CMD) ./build$(SHELL_EXT) all
endif

##@ Test Commands

test: ## Roda todos os testes
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) all
else
	@cargo test --workspace
endif

test-unit: ## Roda apenas testes unitários
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) unit
else
	@cargo test --workspace --lib
endif

test-crypto: ## Roda testes de criptografia
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) crypto
else
	@cargo test -p avila-crypto
endif

test-integration: ## Roda testes de integração
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) integration
else
	@cargo test --workspace --test '*'
endif

test-verbose: ## Roda testes com output verboso
	@cargo test --workspace -- --nocapture --test-threads=1

coverage: ## Gera relatório de cobertura de código
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) all -Coverage
else
	@cargo tarpaulin --workspace --out Html --output-dir coverage
endif

##@ Development Commands

dev: debug ## Build debug e roda servidor
	@echo "$(GREEN)🚀 Iniciando AvilaDB em modo development...$(NC)"
	@./target/debug/aviladb$(EXE_EXT)

run: release ## Build release e roda servidor
	@echo "$(GREEN)🚀 Iniciando AvilaDB...$(NC)"
	@./target/release/aviladb$(EXE_EXT)

watch: ## Roda testes automaticamente ao modificar código (requer cargo-watch)
	@command -v cargo-watch >/dev/null 2>&1 || { echo "$(RED)❌ cargo-watch não instalado. Instale com: cargo install cargo-watch$(NC)"; exit 1; }
	@cargo watch -x test

##@ Quality Commands

check: ## Verifica código sem compilar
	@cargo check --workspace

format: ## Formata código com rustfmt
	@cargo fmt --all

lint: ## Roda clippy (linter)
	@cargo clippy --workspace --all-targets -- -D warnings

fix: ## Auto-fix de problemas simples (clippy + fmt)
	@cargo clippy --workspace --all-targets --fix --allow-dirty
	@cargo fmt --all

audit: ## Verifica vulnerabilidades em dependências
	@cargo audit

##@ Benchmark Commands

bench: ## Roda benchmarks de performance
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\test$(SHELL_EXT) perf
else
	@cargo bench --workspace
endif

bench-crypto: ## Benchmark apenas de crypto primitives
	@cargo bench -p avila-crypto

bench-storage: ## Benchmark do storage engine
	@cargo bench -p aviladb-core

##@ Documentation Commands

docs: ## Gera documentação HTML
	@cargo doc --workspace --no-deps --open

docs-all: ## Gera documentação incluindo dependências
	@cargo doc --workspace --open

##@ Install/Deploy Commands

install: release ## Instala binário no sistema
	@cargo install --path aviladb-core --bin aviladb

uninstall: ## Remove binário instalado
	@cargo uninstall aviladb

strip: release ## Remove símbolos do binário (reduz tamanho)
ifeq ($(DETECTED_OS),Windows)
	@echo "$(YELLOW)⚠️  strip não disponível no Windows$(NC)"
else
	@strip ./target/release/aviladb
	@echo "$(GREEN)✅ Binary stripped: $$(du -h ./target/release/aviladb | cut -f1)$(NC)"
endif

##@ Cleanup Commands

clean: ## Remove artifacts de build
ifeq ($(DETECTED_OS),Windows)
	@$(SHELL_CMD) .\build$(SHELL_EXT) clean
else
	@$(SHELL_CMD) ./build$(SHELL_EXT) clean
endif

clean-all: clean ## Remove tudo (build + docs + coverage)
	@rm -rf target/ coverage/ docs/

##@ Utility Commands

deps: ## Lista dependências do projeto
	@cargo tree

deps-update: ## Atualiza dependências
	@cargo update

size: ## Mostra tamanho dos binários
	@echo "Binary sizes:"
	@du -h target/debug/aviladb$(EXE_EXT) 2>/dev/null || echo "  debug: not built"
	@du -h target/release/aviladb$(EXE_EXT) 2>/dev/null || echo "  release: not built"
	@du -h target/extreme/aviladb$(EXE_EXT) 2>/dev/null || echo "  extreme: not built"

stats: ## Estatísticas do código (LOC, etc)
	@echo "$(CYAN)📊 Codebase Statistics$(NC)"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@find . -name "*.rs" -not -path "./target/*" | xargs wc -l | tail -1 | awk '{print "Total Lines:     " $$1}'
	@find . -name "*.rs" -not -path "./target/*" | wc -l | awk '{print "Rust Files:      " $$1}'
	@find . -name "*.toml" -not -path "./target/*" | wc -l | awk '{print "TOML Files:      " $$1}'
	@find . -name "*.md" | wc -l | awk '{print "Markdown Files:  " $$1}'

version: ## Mostra versão
	@echo "AvilaDB v0.1.0"
	@cargo --version
	@rustc --version

##@ Docker Commands (Future)

docker-build: ## Build Docker image
	@echo "$(YELLOW)🚧 Docker support coming soon$(NC)"

docker-run: ## Roda em container
	@echo "$(YELLOW)🚧 Docker support coming soon$(NC)"

##@ CI/CD Commands

ci: check test lint ## Comandos de CI (check + test + lint)
	@echo "$(GREEN)✅ All CI checks passed!$(NC)"

pre-commit: format lint test ## Hook pre-commit (format + lint + test)
	@echo "$(GREEN)✅ Pre-commit checks passed!$(NC)"

##@ Advanced

flamegraph: release ## Gera flamegraph de performance (Linux)
ifeq ($(DETECTED_OS),Linux)
	@command -v cargo-flamegraph >/dev/null 2>&1 || { echo "$(RED)❌ cargo-flamegraph não instalado. Instale com: cargo install flamegraph$(NC)"; exit 1; }
	@cargo flamegraph --bin aviladb
else
	@echo "$(YELLOW)⚠️  Flamegraph apenas em Linux$(NC)"
endif

asm: ## Mostra assembly gerado (requer cargo-asm)
	@command -v cargo-asm >/dev/null 2>&1 || { echo "$(RED)❌ cargo-asm não instalado. Instale com: cargo install cargo-asm$(NC)"; exit 1; }
	@cargo asm aviladb::main

bloat: ## Analisa tamanho do binário (requer cargo-bloat)
	@command -v cargo-bloat >/dev/null 2>&1 || { echo "$(RED)❌ cargo-bloat não instalado. Instale com: cargo install cargo-bloat$(NC)"; exit 1; }
	@cargo bloat --release -n 20

##@ Examples

example: ## Lista exemplos disponíveis
	@echo "$(CYAN)📚 Available Examples$(NC)"
	@echo "  make run          - Roda servidor"
	@echo "  make dev          - Development mode"
	@echo "  make test         - Roda testes"
	@echo "  make bench        - Benchmarks"

# End of Makefile
