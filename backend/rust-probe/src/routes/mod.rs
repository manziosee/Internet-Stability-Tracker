pub mod bandwidth;
pub mod dns_timing;
pub mod jitter;
pub mod mtu;
pub mod multi_ping;
pub mod packet_loss;
pub mod ping;
pub mod tls_probe;
pub mod traceroute;

use std::net::ToSocketAddrs;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;

/// Core TCP RTT probe — connects to `host:port`, measures elapsed time.
/// Returns `Some(rtt_ms)` on success, `None` on timeout or error.
pub async fn tcp_rtt(host: &str, port: u16, timeout_ms: u64) -> Option<f64> {
    // Resolve hostname synchronously (dns-lookup is blocking)
    let addr_str = format!("{}:{}", host, port);
    let addr = addr_str
        .to_socket_addrs()
        .ok()?
        .next()?;

    let start = Instant::now();
    match tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(addr),
    )
    .await
    {
        Ok(Ok(_stream)) => {
            let rtt = start.elapsed().as_secs_f64() * 1000.0;
            Some((rtt * 100.0).round() / 100.0)
        }
        _ => None,
    }
}

/// Try multiple ports in order, return the first successful RTT.
/// Used by routes that don't know which port the target exposes.
#[allow(dead_code)]
pub async fn tcp_rtt_multi_port(host: &str, timeout_ms: u64) -> Option<(f64, u16)> {
    for port in [443u16, 80, 53] {
        if let Some(rtt) = tcp_rtt(host, port, timeout_ms).await {
            return Some((rtt, port));
        }
    }
    None
}
