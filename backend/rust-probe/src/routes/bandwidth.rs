use axum::{extract::State, Json};
use futures::StreamExt;
use std::sync::Arc;
use std::time::Instant;
use tokio::time::{timeout, Duration};

use crate::{
    config::Config,
    models::{BandwidthRequest, BandwidthResponse},
};

pub async fn handle(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<BandwidthRequest>,
) -> Json<BandwidthResponse> {
    let urls = req.urls.unwrap_or_else(|| cfg.bandwidth_urls.clone());
    let duration_secs = req.duration_secs.unwrap_or(8).clamp(2, 30);

    for url in &urls {
        if let Some(result) = probe_url(url, duration_secs).await {
            return Json(result);
        }
    }

    // All URLs failed
    Json(BandwidthResponse {
        download_mbps: 0.0,
        bytes_received: 0,
        duration_secs: 0.0,
        url_used: String::from("none"),
    })
}

async fn probe_url(url: &str, duration_secs: u64) -> Option<BandwidthResponse> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(duration_secs + 5))
        .build()
        .ok()?;

    let resp = timeout(
        Duration::from_secs(duration_secs + 5),
        client.get(url).send(),
    )
    .await
    .ok()?
    .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let start = Instant::now();
    let deadline = Duration::from_secs(duration_secs);
    let mut stream = resp.bytes_stream();
    let mut bytes: u64 = 0;

    while let Ok(Some(chunk)) = timeout(
        Duration::from_millis(500),
        stream.next(),
    )
    .await
    {
        match chunk {
            Ok(data) => {
                bytes += data.len() as u64;
                if start.elapsed() >= deadline {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let elapsed = start.elapsed().as_secs_f64();
    if elapsed < 0.1 || bytes == 0 {
        return None;
    }

    let mbps = (bytes as f64 * 8.0) / (elapsed * 1_000_000.0);
    Some(BandwidthResponse {
        download_mbps: (mbps * 100.0).round() / 100.0,
        bytes_received: bytes,
        duration_secs: (elapsed * 100.0).round() / 100.0,
        url_used: url.to_owned(),
    })
}
