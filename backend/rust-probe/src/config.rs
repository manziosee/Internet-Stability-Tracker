use std::env;

/// All configuration sourced from environment variables — nothing hardcoded.
#[derive(Debug, Clone)]
pub struct Config {
    /// Port this service listens on (env: PROBE_PORT, default: 8001)
    pub port: u16,
    /// Default host to probe when none is given in the request (env: PROBE_DEFAULT_HOST)
    pub default_host: String,
    /// Default TCP port used for RTT probes (env: PROBE_DEFAULT_TCP_PORT, default: 443)
    pub default_tcp_port: u16,
    /// Per-probe timeout in milliseconds (env: PROBE_TIMEOUT_MS, default: 2000)
    pub timeout_ms: u64,
    /// Maximum concurrent probes for packet-loss test (env: PROBE_MAX_CONCURRENT, default: 50)
    pub max_concurrent: usize,
    /// Comma-separated CDN URLs used for bandwidth probes
    /// (env: PROBE_BANDWIDTH_URLS)
    pub bandwidth_urls: Vec<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env_u16("PROBE_PORT", 8001);
        let default_host = env_str("PROBE_DEFAULT_HOST", "8.8.8.8");
        let default_tcp_port = env_u16("PROBE_DEFAULT_TCP_PORT", 443);
        let timeout_ms = env_u64("PROBE_TIMEOUT_MS", 2000);
        let max_concurrent = env_usize("PROBE_MAX_CONCURRENT", 50);
        let bandwidth_urls = env_vec(
            "PROBE_BANDWIDTH_URLS",
            &[
                "https://speed.cloudflare.com/__down?bytes=25000000",
                "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
                "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js",
            ],
        );

        Config {
            port,
            default_host,
            default_tcp_port,
            timeout_ms,
            max_concurrent,
            bandwidth_urls,
        }
    }
}

fn env_str(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_vec(key: &str, defaults: &[&str]) -> Vec<String> {
    env::var(key)
        .map(|v| v.split(',').map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_else(|_| defaults.iter().map(|s| s.to_string()).collect())
}
