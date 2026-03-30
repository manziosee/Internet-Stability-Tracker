use axum::{extract::State, Json};
use std::sync::Arc;
use tokio::time::{sleep, Duration};

use crate::{
    config::Config,
    models::{JitterRequest, JitterResponse},
    routes::tcp_rtt,
};

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<JitterRequest>,
) -> Json<JitterResponse> {
    let host = req.host.unwrap_or_else(|| cfg.default_host.clone());
    let port = req.port.unwrap_or(cfg.default_tcp_port);
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);
    let samples = req.samples.unwrap_or(30).clamp(5, 100);
    let interval_ms = req.interval_ms.unwrap_or(100).clamp(50, 500);

    let mut latencies: Vec<f64> = Vec::with_capacity(samples);
    for i in 0..samples {
        if let Some(rtt) = tcp_rtt(&host, port, timeout_ms).await {
            latencies.push(rtt);
        }
        // No sleep after the last sample
        if i < samples - 1 {
            sleep(Duration::from_millis(interval_ms)).await;
        }
    }

    // Need at least 2 samples to compute jitter
    if latencies.len() < 2 {
        // Return zero jitter if we can't measure
        return Json(JitterResponse {
            host,
            port,
            samples_collected: latencies.len(),
            jitter_ms: 0.0,
            jitter_stdev_ms: 0.0,
            min_jitter_ms: 0.0,
            max_jitter_ms: 0.0,
            avg_latency_ms: latencies.first().copied().unwrap_or(0.0),
            quality: "unknown",
        });
    }

    // Mean absolute deviation between consecutive samples (RFC 3550 jitter)
    let diffs: Vec<f64> = latencies
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .collect();

    let avg_jitter = diffs.iter().sum::<f64>() / diffs.len() as f64;
    let variance = diffs.iter().map(|d| (d - avg_jitter).powi(2)).sum::<f64>() / diffs.len() as f64;
    let stdev = variance.sqrt();
    let min_j = diffs.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_j = diffs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let avg_lat = latencies.iter().sum::<f64>() / latencies.len() as f64;

    let quality = assess_jitter(avg_jitter);

    Json(JitterResponse {
        host,
        port,
        samples_collected: latencies.len(),
        jitter_ms: round2(avg_jitter),
        jitter_stdev_ms: round2(stdev),
        min_jitter_ms: round2(min_j),
        max_jitter_ms: round2(max_j),
        avg_latency_ms: round2(avg_lat),
        quality,
    })
}

fn assess_jitter(jitter_ms: f64) -> &'static str {
    if jitter_ms < 5.0 {
        "excellent"
    } else if jitter_ms < 15.0 {
        "good"
    } else if jitter_ms < 30.0 {
        "fair"
    } else {
        "poor"
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
