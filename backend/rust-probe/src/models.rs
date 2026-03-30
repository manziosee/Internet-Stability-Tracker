use serde::{Deserialize, Serialize};

// ── Ping ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PingRequest {
    pub host: Option<String>,
    /// TCP port to connect to for RTT measurement (default: 443)
    pub port: Option<u16>,
    /// Timeout in milliseconds (default: from config)
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct PingResponse {
    pub host: String,
    pub port: u16,
    pub rtt_ms: Option<f64>,
    pub reachable: bool,
    pub method: &'static str,
}

// ── Packet loss ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PacketLossRequest {
    pub host: Option<String>,
    /// Number of probes to send (10–200)
    pub count: Option<usize>,
    pub port: Option<u16>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct PacketLossResponse {
    pub host: String,
    pub port: u16,
    pub packets_sent: usize,
    pub packets_received: usize,
    pub packet_loss_percent: f64,
    pub avg_latency_ms: Option<f64>,
    pub min_latency_ms: Option<f64>,
    pub max_latency_ms: Option<f64>,
    pub p95_latency_ms: Option<f64>,
    pub method: &'static str,
}

// ── Jitter ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct JitterRequest {
    pub host: Option<String>,
    pub port: Option<u16>,
    /// Number of sequential samples (10–100)
    pub samples: Option<usize>,
    /// Delay between samples in ms (default: 100)
    pub interval_ms: Option<u64>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct JitterResponse {
    pub host: String,
    pub port: u16,
    pub samples_collected: usize,
    pub jitter_ms: f64,
    pub jitter_stdev_ms: f64,
    pub min_jitter_ms: f64,
    pub max_jitter_ms: f64,
    pub avg_latency_ms: f64,
    pub quality: &'static str,
}

// ── Bandwidth ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct BandwidthRequest {
    /// CDN URLs to download from (falls back to config defaults)
    pub urls: Option<Vec<String>>,
    /// How long to stream before stopping (seconds, default: 8)
    pub duration_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct BandwidthResponse {
    pub download_mbps: f64,
    pub bytes_received: u64,
    pub duration_secs: f64,
    pub url_used: String,
}

// ── Traceroute ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TracerouteRequest {
    pub host: Option<String>,
    /// Max hops (default: 20)
    pub max_hops: Option<u8>,
    /// Per-hop timeout in seconds for the subprocess (default: 2)
    pub hop_timeout_secs: Option<u8>,
}

#[derive(Debug, Serialize)]
pub struct TracerouteHop {
    pub hop: u8,
    pub ip: Option<String>,
    pub hostname: Option<String>,
    pub rtt_ms: Option<f64>,
    pub asn: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TracerouteResponse {
    pub host: String,
    pub hops: Vec<TracerouteHop>,
    pub total_hops: usize,
    pub reached_target: bool,
}

// ── MTU ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct MtuRequest {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct MtuResponse {
    pub host: String,
    pub optimal_mtu: u16,
    pub standard_mtu: u16,
    pub needs_adjustment: bool,
    pub recommendation: String,
    pub method: &'static str,
}

// ── Health ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub icmp_available: bool,
}
