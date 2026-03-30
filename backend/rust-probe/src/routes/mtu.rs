use axum::{extract::State, Json};
use std::sync::Arc;

use crate::{
    config::Config,
    models::{MtuRequest, MtuResponse},
    routes::tcp_rtt,
};

/// MTU discovery via TCP reachability.
/// We can't set IP_DONTFRAG without raw sockets, so we estimate:
/// if the host is reachable we assume standard MTU (1500),
/// and note that a real MTU discovery requires ICMP or raw sockets.
pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<MtuRequest>,
) -> Json<MtuResponse> {
    let host = req.host.unwrap_or_else(|| cfg.default_host.clone());
    let port = req.port.unwrap_or(cfg.default_tcp_port);
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);

    let reachable = tcp_rtt(&host, port, timeout_ms).await.is_some();
    let optimal_mtu: u16 = 1500;

    Json(MtuResponse {
        host,
        optimal_mtu,
        standard_mtu: 1500,
        needs_adjustment: false,
        recommendation: if reachable {
            "Standard MTU (1500) — host is reachable. Full PMTUD requires ICMP support.".into()
        } else {
            "Host unreachable — cannot determine MTU.".into()
        },
        method: "tcp_reachability",
    })
}
