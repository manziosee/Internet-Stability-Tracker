use axum::{extract::State, Json};
use std::sync::Arc;

use crate::{
    config::Config,
    models::{PingRequest, PingResponse},
    routes::tcp_rtt,
};

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<PingRequest>,
) -> Json<PingResponse> {
    let host = req.host.unwrap_or_else(|| cfg.default_host.clone());
    let port = req.port.unwrap_or(cfg.default_tcp_port);
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);

    let rtt_ms = tcp_rtt(&host, port, timeout_ms).await;

    Json(PingResponse {
        host,
        port,
        rtt_ms,
        reachable: rtt_ms.is_some(),
        method: "tcp_connect",
    })
}
