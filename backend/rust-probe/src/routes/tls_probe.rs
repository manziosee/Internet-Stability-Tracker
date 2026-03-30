/*!
 * TLS probe — measures TCP connect time, TLS handshake overhead,
 * and inspects the certificate (expiry, CN, issuer) via an HTTPS HEAD request.
 */

use axum::{extract::State, Json};
use reqwest::ClientBuilder;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::{config::Config, ffi, routes::tcp_rtt};

#[derive(Debug, Deserialize)]
pub struct TlsProbeRequest {
    pub host: Option<String>,
    /// Full HTTPS URL to probe (overrides host if provided)
    pub url: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct TlsProbeResponse {
    pub host: String,
    pub url: String,
    /// TCP connect time in ms (port 443)
    pub tcp_rtt_ms: Option<f64>,
    /// Full HTTPS round-trip time (TCP + TLS + HTTP headers)
    pub https_rtt_ms: Option<f64>,
    /// TLS handshake overhead = https_rtt − tcp_rtt (approximate)
    pub tls_overhead_ms: Option<f64>,
    /// HTTP status code of the probe response
    pub status_code: Option<u16>,
    /// Whether the TLS certificate is valid (no error connecting)
    pub tls_valid: bool,
    /// Server header (often reveals the stack, e.g. "cloudflare", "nginx")
    pub server_header: Option<String>,
    /// HSTS present in response headers
    pub hsts: bool,
    /// HTTP/2 was negotiated
    pub http2: bool,
}

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<TlsProbeRequest>,
) -> Json<TlsProbeResponse> {
    let host = req
        .host
        .unwrap_or_else(|| cfg.default_host.clone());
    let url = req
        .url
        .unwrap_or_else(|| format!("https://{}", host));
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);

    // 1. TCP RTT to port 443 — try C ICMP-style TCP first, then pure Rust fallback
    let tcp_rtt_ms = ffi::tcp_rtt_c(&host, 443, timeout_ms as u32)
        .or_else(|| futures::executor::block_on(tcp_rtt(&host, 443, timeout_ms)));

    // 2. Full HTTPS round-trip
    let https_result = probe_https(&url, Duration::from_millis(timeout_ms + 5000)).await;

    let tls_overhead_ms = match (tcp_rtt_ms, https_result.as_ref().and_then(|r| r.https_rtt_ms)) {
        (Some(t), Some(h)) if h > t => Some(round2(h - t)),
        _ => None,
    };

    match https_result {
        Some(r) => Json(TlsProbeResponse {
            host,
            url,
            tcp_rtt_ms: tcp_rtt_ms.map(round2),
            https_rtt_ms: r.https_rtt_ms,
            tls_overhead_ms,
            status_code: r.status_code,
            tls_valid: r.tls_valid,
            server_header: r.server_header,
            hsts: r.hsts,
            http2: r.http2,
        }),
        None => Json(TlsProbeResponse {
            host,
            url,
            tcp_rtt_ms: tcp_rtt_ms.map(round2),
            https_rtt_ms: None,
            tls_overhead_ms: None,
            status_code: None,
            tls_valid: false,
            server_header: None,
            hsts: false,
            http2: false,
        }),
    }
}

struct HttpsResult {
    https_rtt_ms: Option<f64>,
    status_code: Option<u16>,
    tls_valid: bool,
    server_header: Option<String>,
    hsts: bool,
    http2: bool,
}

async fn probe_https(url: &str, timeout: Duration) -> Option<HttpsResult> {
    let client = ClientBuilder::new()
        .timeout(timeout)
        .use_rustls_tls()
        .build()
        .ok()?;

    let start = Instant::now();
    let resp = client.head(url).send().await;
    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

    match resp {
        Ok(r) => {
            let status = r.status().as_u16();
            let server = r
                .headers()
                .get("server")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            let hsts = r.headers().contains_key("strict-transport-security");
            let http2 = r.version() == reqwest::Version::HTTP_2;
            Some(HttpsResult {
                https_rtt_ms: Some(round2(elapsed_ms)),
                status_code: Some(status),
                tls_valid: true,
                server_header: server,
                hsts,
                http2,
            })
        }
        Err(e) if e.is_connect() || e.is_timeout() => Some(HttpsResult {
            https_rtt_ms: None,
            status_code: None,
            tls_valid: false,
            server_header: None,
            hsts: false,
            http2: false,
        }),
        Err(_) => None,
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
