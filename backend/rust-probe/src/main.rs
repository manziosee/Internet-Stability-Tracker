mod config;
mod ffi;
mod models;
mod routes;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use config::Config;
use models::HealthResponse;

#[tokio::main]
async fn main() {
    // Structured logging — level controlled by RUST_LOG env var (default: info)
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    let cfg = Arc::new(Config::from_env());
    let port = cfg.port;

    // Log capability status at startup
    let icmp_available = ffi::icmp_ping("127.0.0.1", 100).is_some();
    info!(
        "ist-probe v{} starting — ICMP: {} (CAP_NET_RAW {})",
        env!("CARGO_PKG_VERSION"),
        if icmp_available { "real" } else { "TCP fallback" },
        if icmp_available { "available" } else { "unavailable" },
    );

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Core probes
        .route("/health",       get(health))
        .route("/ping",         post(routes::ping::handle))
        .route("/packet-loss",  post(routes::packet_loss::handle))
        .route("/jitter",       post(routes::jitter::handle))
        .route("/bandwidth",    post(routes::bandwidth::handle))
        .route("/traceroute",   post(routes::traceroute::handle))
        .route("/mtu",          post(routes::mtu::handle))
        // New: TLS, DNS, multi-host
        .route("/tls-probe",    post(routes::tls_probe::handle))
        .route("/dns-timing",   post(routes::dns_timing::handle))
        .route("/multi-ping",   post(routes::multi_ping::handle))
        .layer(cors)
        .with_state(cfg);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("ist-probe listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind probe port");

    axum::serve(listener, app)
        .await
        .expect("probe server crashed");
}

async fn health(State(_): State<Arc<Config>>) -> Json<HealthResponse> {
    let icmp_ok = ffi::icmp_ping("127.0.0.1", 100).is_some();
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        icmp_available: icmp_ok,
    })
}
