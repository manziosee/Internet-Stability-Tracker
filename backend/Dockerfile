# ═══════════════════════════════════════════════════════════════════════════════
# Internet Stability Tracker v4.0 — Multi-Language Backend
#
# Four build stages — each language compiled in isolation, only the stripped
# binaries are copied into the final runtime image:
#
#   Stage 1  c-builder    debian:bookworm-slim + gcc
#            → libisttime.a  (ICMP echo · CLOCK_MONOTONIC_RAW · TCP RTT)
#
#   Stage 2  rust-builder rust:1.83-slim
#            → ist-probe   (Axum HTTP server; links libisttime.a via FFI)
#              Routes: /ping · /packet-loss · /jitter · /bandwidth
#                      /traceroute · /mtu · /tls-probe · /dns-timing · /multi-ping
#
#   Stage 3  go-builder   golang:1.22-alpine  (CGO_ENABLED=0 — fully static)
#            → go-agent   (stdlib-only HTTP server)
#              Routes: /health · /metrics · /cache/{key}
#                      /events/push · /events/subscribe (SSE hub)
#
#   Stage 4  runtime      python:3.12-slim
#            Python FastAPI (uvicorn × 2 workers)
#            + ist-probe binary  (port 8001, internal)
#            + go-agent binary   (port 8002, internal)
#            All three started by start.sh
#
# Final image size is kept small because:
#   • Rust binary is LTO-stripped
#   • Go binary is statically linked with ldflags="-s -w"
#   • Intermediate build layers are discarded (multi-stage)
#   • No compilers in the runtime image
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: C timing / ICMP library ─────────────────────────────────────────
FROM debian:bookworm-slim AS c-builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc make libc6-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build/c-timing
COPY c-timing/ .

# -fPIC → position-independent code (required for static linking with Rust)
# ar rcs → create a static archive from the single object file
RUN gcc -O2 -Wall -Wextra -fPIC -c icmp.c -o icmp.o \
 && ar rcs libisttime.a icmp.o


# ── Stage 2: Rust probe (ist-probe) ──────────────────────────────────────────
FROM rust:1.83-slim AS rust-builder

# gcc needed by the `cc` crate even when we link a pre-built archive
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Pull in the pre-built C archive and its public header
COPY --from=c-builder /build/c-timing/libisttime.a /build/c-timing/libisttime.a
COPY c-timing/icmp.h  /build/c-timing/icmp.h

# Tell build.rs to link the archive instead of recompiling the C source
ENV ISTTIME_LIB_DIR=/build/c-timing

# ── Dependency-caching layer (warm up the Cargo registry) ───────────────────
# Build a throwaway binary first so cargo downloads and compiles all deps.
# Changing application source later only recompiles ist-probe itself.
COPY rust-probe/Cargo.toml ./rust-probe/
RUN mkdir -p rust-probe/src \
 && echo 'fn main(){}' > rust-probe/src/main.rs \
 && cd rust-probe && cargo build --release \
 && rm -rf src

# ── Real application build ───────────────────────────────────────────────────
COPY rust-probe/ ./rust-probe/
RUN cd rust-probe \
 && touch src/main.rs \
 && cargo build --release


# ── Stage 3: Go agent (go-agent) ─────────────────────────────────────────────
FROM golang:1.22-alpine AS go-builder

WORKDIR /build/go-agent
COPY go-agent/ .

# CGO_ENABLED=0 → pure Go, no libc dependency → fully static binary
# -ldflags="-s -w" → strip debug symbols and DWARF → smaller binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -trimpath -o go-agent .


# ── Stage 4: Runtime image ────────────────────────────────────────────────────
FROM python:3.12-slim

LABEL org.opencontainers.image.title="IST Backend" \
      org.opencontainers.image.description="Internet Stability Tracker v4.0 — Python + Rust + Go + C" \
      org.opencontainers.image.version="4.0.0" \
      org.opencontainers.image.source="https://github.com/manziosee/Internet-Stability-Tracker" \
      org.opencontainers.image.licenses="MIT"

# ── System packages ───────────────────────────────────────────────────────────
# curl    → health check (HEALTHCHECK directive)
# traceroute, iputils-ping, dnsutils → advanced network diagnostics
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends \
      curl \
      traceroute \
      iputils-ping \
      dnsutils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────────
# Copied before application code so this layer is cached when only .py files change
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# ── Compiled binaries ─────────────────────────────────────────────────────────
COPY --from=rust-builder /build/rust-probe/target/release/ist-probe /usr/local/bin/ist-probe
COPY --from=go-builder   /build/go-agent/go-agent                   /usr/local/bin/go-agent

# ── Application source ────────────────────────────────────────────────────────
COPY . .

# ── Process supervisor ────────────────────────────────────────────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

# ── Security: drop root ───────────────────────────────────────────────────────
RUN adduser --disabled-password --no-create-home --gecos "" appuser \
 && chown -R appuser:appuser /app
USER appuser

# Only the Python FastAPI port is exposed externally.
# Rust (8001) and Go (8002) are bound to 127.0.0.1 — not reachable from outside.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=35s --retries=3 \
  CMD curl -fs http://localhost:8000/health || exit 1

CMD ["/start.sh"]
