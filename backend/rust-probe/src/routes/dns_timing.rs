/*!
 * DNS timing — parallel DoH queries to multiple resolvers.
 * Returns per-resolver latency so the user can find the fastest one.
 *
 * Uses DNS-over-HTTPS (DoH) so no raw UDP socket privileges are needed.
 * Each resolver is queried concurrently via reqwest.
 */

use axum::{extract::State, Json};
use futures::future::join_all;
use reqwest::ClientBuilder;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct DnsTimingRequest {
    /// Domain to resolve (default: "example.com")
    pub domain: Option<String>,
    /// DoH resolver URLs to test — falls back to config defaults when empty
    pub resolvers: Option<Vec<String>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ResolverResult {
    pub name: String,
    pub url: String,
    pub latency_ms: Option<f64>,
    pub resolved_ip: Option<String>,
    pub success: bool,
    pub is_fastest: bool,
}

#[derive(Debug, Serialize)]
pub struct DnsTimingResponse {
    pub domain: String,
    pub results: Vec<ResolverResult>,
    pub fastest_resolver: Option<String>,
    pub slowest_resolver: Option<String>,
    pub recommendation: String,
}

/// Well-known DoH resolvers — name, DoH URL
const DEFAULT_RESOLVERS: &[(&str, &str)] = &[
    ("Cloudflare", "https://cloudflare-dns.com/dns-query"),
    ("Google",     "https://dns.google/resolve"),
    ("Quad9",      "https://dns.quad9.net/dns-query"),
    ("NextDNS",    "https://dns.nextdns.io/dns-query"),
];

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<DnsTimingRequest>,
) -> Json<DnsTimingResponse> {
    let domain = req.domain.unwrap_or_else(|| "example.com".into());
    let timeout_ms = req.timeout_ms.unwrap_or(cfg.timeout_ms);

    // Build resolver list: user-supplied or defaults
    let resolvers: Vec<(String, String)> = if let Some(urls) = req.resolvers.filter(|v| !v.is_empty()) {
        urls.into_iter()
            .enumerate()
            .map(|(i, url)| (format!("Custom-{}", i + 1), url))
            .collect()
    } else {
        DEFAULT_RESOLVERS
            .iter()
            .map(|(name, url)| (name.to_string(), url.to_string()))
            .collect()
    };

    // Query all resolvers concurrently
    let futures: Vec<_> = resolvers
        .iter()
        .map(|(name, url)| query_doh(name.clone(), url.clone(), domain.clone(), timeout_ms))
        .collect();

    let mut results = join_all(futures).await;

    // Find fastest / slowest among successful resolvers
    let fastest = results
        .iter()
        .filter(|r| r.success)
        .min_by(|a, b| a.latency_ms.partial_cmp(&b.latency_ms).unwrap())
        .map(|r| r.name.clone());
    let slowest = results
        .iter()
        .filter(|r| r.success)
        .max_by(|a, b| a.latency_ms.partial_cmp(&b.latency_ms).unwrap())
        .map(|r| r.name.clone());

    // Mark the fastest result
    if let Some(ref f) = fastest {
        for r in results.iter_mut() {
            if &r.name == f {
                r.is_fastest = true;
            }
        }
    }

    let recommendation = match &fastest {
        Some(name) => format!(
            "Use {} for the lowest DNS latency from this server. \
             Consider setting it as your system/router DNS.",
            name
        ),
        None => "All DNS resolvers are unreachable from this server.".into(),
    };

    Json(DnsTimingResponse {
        domain,
        results,
        fastest_resolver: fastest,
        slowest_resolver: slowest,
        recommendation,
    })
}

async fn query_doh(
    name: String,
    base_url: String,
    domain: String,
    timeout_ms: u64,
) -> ResolverResult {
    let client = match ClientBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .use_rustls_tls()
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            return ResolverResult {
                name,
                url: base_url,
                latency_ms: None,
                resolved_ip: None,
                success: false,
                is_fastest: false,
            }
        }
    };

    // DoH JSON format (RFC 8484 + JSON variant)
    let url = format!("{}?name={}&type=A", base_url, domain);

    let start = Instant::now();
    let resp = client
        .get(&url)
        .header("Accept", "application/dns-json")
        .send()
        .await;
    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    match resp {
        Ok(r) if r.status().is_success() => {
            let resolved_ip = r
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|v| {
                    v["Answer"]
                        .as_array()?
                        .iter()
                        .find(|a| a["type"].as_u64() == Some(1)) // A record
                        .and_then(|a| a["data"].as_str().map(str::to_owned))
                });

            ResolverResult {
                name,
                url: base_url,
                latency_ms: Some(round2(elapsed)),
                resolved_ip,
                success: true,
                is_fastest: false,
            }
        }
        _ => ResolverResult {
            name,
            url: base_url,
            latency_ms: None,
            resolved_ip: None,
            success: false,
            is_fastest: false,
        },
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
