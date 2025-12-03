# Build Stage - Backend only
FROM rust:1.75-slim as backend-builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend files
COPY backend ./backend

# Build backend in release mode
WORKDIR /app/backend
RUN cargo build --release

# Runtime Stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend binary
COPY --from=backend-builder /app/backend/target/release/avila-erp-backend /app/backend

# Expose port
EXPOSE 3000

# Set environment variables
ENV RUST_LOG=info
ENV DATABASE_URL=sqlite:///app/database/erp.db
ENV PORT=3000

# Create database directory
RUN mkdir -p /app/database

# Start backend
CMD ["/app/backend"]
