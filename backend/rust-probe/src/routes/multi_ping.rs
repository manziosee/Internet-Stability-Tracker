/*!
 * Multi-host parallel ping.
 *
 * Strategy (per host):
 *   1. Try real ICMP via the C library (requires CAP_NET_RAW)
 *   2. Fall back to C TCP connect RTT (no special privileges)
 *   3. Fall back to Rust async TCP connect
 *
 * All hosts are probed concurrently using tokio::spawn so a slow
 * host does not block others.
 */

use axum::{extract::State, Json};
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{config::Config, ffi, routes::tcp_rtt};

#[derive(Debug, Deserialize)]
pub struct MultiPingRequest {
    /// List of hostnames / IPs to probe (max 20)
    pub hosts: Vec<String>,
    pub port: Option<u16>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct HostResult {
    pub host: String,
    pub rtt_ms: Option<f64>,
    pub reachable: bool,
    pub method: &'static str,
}

#[derive(Debug, Serialize)]
pub struct MultiPingResponse {
    pub results: Vec<HostResult>,
    pub reachable_count: usize,
    pub unreachable_count: usize,
    pub fastest_host: Option<String>,
    pub avg_rtt_ms: Option<f64>,
}

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<MultiPingRequest>,
) -> Json<MultiPingResponse> {
    let port = req.port.unwrap_or(cfg.default_tcp_port);
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);

    // Cap at 20 hosts to prevent abuse
    let hosts: Vec<String> = req.hosts.into_iter().take(20).collect();

    // Probe all hosts concurrently
    let futures: Vec<_> = hosts
        .iter()
        .map(|h| probe_host(h.clone(), port, timeout_ms))
        .collect();

    let results = join_all(futures).await;

    let reachable_count = results.iter().filter(|r| r.reachable).count();
    let unreachable_count = results.len() - reachable_count;

    let rtts: Vec<f64> = results.iter().filter_map(|r| r.rtt_ms).collect();
    let avg_rtt_ms = if !rtts.is_empty() {
        let avg = rtts.iter().sum::<f64>() / rtts.len() as f64;
        Some((avg * 100.0).round() / 100.0)
    } else {
        None
    };

    let fastest_host = results
        .iter()
        .filter(|r| r.reachable)
        .min_by(|a, b| a.rtt_ms.partial_cmp(&b.rtt_ms).unwrap())
        .map(|r| r.host.clone());

    Json(MultiPingResponse {
        results,
        reachable_count,
        unreachable_count,
        fastest_host,
        avg_rtt_ms,
    })
}

async fn probe_host(host: String, port: u16, timeout_ms: u64) -> HostResult {
    // 1. Real ICMP via C (requires CAP_NET_RAW)
    if let Some(rtt) = ffi::icmp_ping(&host, timeout_ms as u32) {
        return HostResult {
            host,
            rtt_ms: Some(rtt),
            reachable: true,
            method: "icmp",
        };
    }

    // 2. TCP via C (non-blocking select loop, more accurate than Rust async)
    if let Some(rtt) = ffi::tcp_rtt_c(&host, port, timeout_ms as u32) {
        return HostResult {
            host,
            rtt_ms: Some(rtt),
            reachable: true,
            method: "tcp_c",
        };
    }

    // 3. Rust async TCP fallback
    if let Some(rtt) = tcp_rtt(&host, port, timeout_ms).await {
        return HostResult {
            host,
            rtt_ms: Some(rtt),
            reachable: true,
            method: "tcp_rust",
        };
    }

    HostResult {
        host,
        rtt_ms: None,
        reachable: false,
        method: "unreachable",
    }
}
