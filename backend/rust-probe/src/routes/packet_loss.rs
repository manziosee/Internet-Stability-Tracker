use axum::{extract::State, Json};
use futures::future::join_all;
use std::sync::Arc;

use crate::{
    config::Config,
    models::{PacketLossRequest, PacketLossResponse},
    routes::tcp_rtt,
};

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<PacketLossRequest>,
) -> Json<PacketLossResponse> {
    let host = req.host.unwrap_or_else(|| cfg.default_host.clone());
    let port = req.port.unwrap_or(cfg.default_tcp_port);
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);
    let count = req.count.unwrap_or(20).clamp(5, 200);
    let concurrency = cfg.max_concurrent.min(count);

    // Fan out probes in chunks to respect max_concurrent
    let mut all_rtts: Vec<Option<f64>> = Vec::with_capacity(count);
    let mut sent = 0usize;

    while sent < count {
        let batch = (count - sent).min(concurrency);
        let futures: Vec<_> = (0..batch)
            .map(|_| tcp_rtt(&host, port, timeout_ms))
            .collect();
        let results = join_all(futures).await;
        all_rtts.extend(results);
        sent += batch;
    }

    let received: Vec<f64> = all_rtts.into_iter().flatten().collect();
    let packets_received = received.len();
    let loss = if count > 0 {
        ((count - packets_received) as f64 / count as f64) * 100.0
    } else {
        0.0
    };

    let (avg, min, max, p95) = if !received.is_empty() {
        let mut sorted = received.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let avg = received.iter().sum::<f64>() / received.len() as f64;
        let min = sorted.first().copied().unwrap();
        let max = sorted.last().copied().unwrap();
        let p95_idx = ((received.len() as f64 * 0.95) as usize).min(received.len() - 1);
        let p95 = sorted[p95_idx];
        (
            Some(round2(avg)),
            Some(round2(min)),
            Some(round2(max)),
            Some(round2(p95)),
        )
    } else {
        (None, None, None, None)
    };

    Json(PacketLossResponse {
        host,
        port,
        packets_sent: count,
        packets_received,
        packet_loss_percent: round2(loss),
        avg_latency_ms: avg,
        min_latency_ms: min,
        max_latency_ms: max,
        p95_latency_ms: p95,
        method: "tcp_connect_concurrent",
    })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
