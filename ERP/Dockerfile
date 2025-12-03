# Build Stage - Backend
FROM rust:1.75-slim as backend-builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY backend ./backend

# Build backend in release mode
WORKDIR /app/backend
RUN cargo build --release

# Build Stage - Frontend WASM
FROM rust:1.75-slim as frontend-builder

WORKDIR /app

# Install wasm-pack
RUN cargo install wasm-pack

# Copy frontend files
COPY frontend-wasm ./frontend-wasm

# Build WASM
WORKDIR /app/frontend-wasm
RUN wasm-pack build --target web --release

# Runtime Stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend binary
COPY --from=backend-builder /app/backend/target/release/avila-erp-server /app/avila-erp-server

# Copy frontend WASM files
COPY --from=frontend-builder /app/frontend-wasm/pkg /app/frontend/pkg
COPY --from=frontend-builder /app/frontend-wasm/index.html /app/frontend/index.html

# Copy static assets
COPY Arcsat.ico /app/frontend/Arcsat.ico

# Expose ports
EXPOSE 3000
EXPOSE 8080

# Set environment variables
ENV RUST_LOG=info
ENV DATABASE_URL=sqlite:///app/data/avila_erp.db

# Create data directory
RUN mkdir -p /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Start backend
CMD ["/app/avila-erp-server"]
