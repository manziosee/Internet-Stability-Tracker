use axum::{extract::State, Json};
use std::process::Command;
use std::sync::Arc;

use crate::{
    config::Config,
    models::{TracerouteHop, TracerouteRequest, TracerouteResponse},
};

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<TracerouteRequest>,
) -> Json<TracerouteResponse> {
    let host = req.host.unwrap_or_else(|| cfg.default_host.clone());
    let max_hops = req.max_hops.unwrap_or(20).clamp(1, 30);
    let hop_timeout = req.hop_timeout_secs.unwrap_or(2).clamp(1, 5);

    let hops = run_traceroute(&host, max_hops, hop_timeout);
    let reached = hops.last().map(|h| h.ip.as_deref() == Some(host.as_str())).unwrap_or(false);
    let total = hops.len();

    Json(TracerouteResponse {
        host,
        hops,
        total_hops: total,
        reached_target: reached,
    })
}

fn run_traceroute(host: &str, max_hops: u8, timeout_secs: u8) -> Vec<TracerouteHop> {
    // Try traceroute, then tracepath
    for cmd in &[
        vec!["traceroute", "-n", "-m", &max_hops.to_string(), "-w", &timeout_secs.to_string(), host],
        vec!["tracepath", "-n", "-m", &max_hops.to_string(), host],
    ] {
        if let Ok(output) = Command::new(cmd[0]).args(&cmd[1..]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.trim().is_empty() {
                return parse_traceroute(&stdout);
            }
        }
    }
    vec![]
}

fn parse_traceroute(output: &str) -> Vec<TracerouteHop> {
    let mut hops = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Split on whitespace
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        // First token should be hop number
        let hop_num = match parts[0].trim_end_matches('.').parse::<u8>() {
            Ok(n) => n,
            Err(_) => continue,
        };

        // Check for * * * (timeout)
        if parts.iter().skip(1).all(|&p| p == "*") {
            hops.push(TracerouteHop {
                hop: hop_num,
                ip: None,
                hostname: None,
                rtt_ms: None,
                asn: None,
            });
            continue;
        }

        // Extract IP and RTT
        let mut ip: Option<String> = None;
        let mut rtt: Option<f64> = None;

        for (i, &part) in parts.iter().enumerate().skip(1) {
            // IP address pattern: contains dots and digits
            if ip.is_none() && part != "*" && looks_like_ip(part) {
                ip = Some(part.to_owned());
            }
            // RTT: a number followed by "ms"
            if rtt.is_none() {
                if let Ok(v) = part.trim_end_matches("ms").parse::<f64>() {
                    // Make sure next token is "ms" OR this token ends with "ms"
                    let is_rtt = part.ends_with("ms")
                        || parts.get(i + 1).map(|&n| n == "ms").unwrap_or(false);
                    if is_rtt {
                        rtt = Some(v);
                    }
                }
            }
        }

        hops.push(TracerouteHop {
            hop: hop_num,
            ip: ip.clone(),
            hostname: None,
            rtt_ms: rtt,
            asn: ip.as_deref().and_then(asn_label).map(str::to_owned),
        });
    }

    hops
}

fn looks_like_ip(s: &str) -> bool {
    // Simple IPv4 / IPv6 heuristic
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok()) {
        return true;
    }
    // IPv6: contains colons
    s.contains(':')
}

/// Best-effort ASN label from well-known IP prefixes — no external API calls.
/// Real-world deployments can replace this with a MaxMind GeoIP lookup.
fn asn_label(ip: &str) -> Option<&'static str> {
    if ip.starts_with("8.8.") || ip.starts_with("8.4.") {
        return Some("AS15169 Google");
    }
    if ip.starts_with("1.1.1.") || ip.starts_with("1.0.0.") {
        return Some("AS13335 Cloudflare");
    }
    if ip.starts_with("9.9.9.") {
        return Some("AS19281 Quad9");
    }
    if ip.starts_with("208.67.") {
        return Some("AS36692 OpenDNS");
    }
    if ip.starts_with("10.") || ip.starts_with("172.16.") || ip.starts_with("192.168.") {
        return Some("Private");
    }
    None
}
