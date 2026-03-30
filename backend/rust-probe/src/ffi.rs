/*!
 * Safe Rust wrappers around the C timing library (c-timing/icmp.c).
 *
 * All `unsafe` blocks are confined to this module.
 * All public functions return safe Rust types.
 */

use std::ffi::CString;
use std::os::raw::{c_char, c_uint};

// ── Raw C bindings ────────────────────────────────────────────────────────────

// Suppress dead_code warnings for FFI symbols that may not all be called yet
#[allow(dead_code)]
extern "C" {
    /// Raw ICMP echo — returns RTT µs, or -1 (no caps / timeout / error).
    fn ist_icmp_ping(host: *const c_char, timeout_ms: c_uint) -> i64;

    /// CLOCK_MONOTONIC_RAW nanoseconds.
    fn ist_monotonic_ns() -> u64;

    /// TCP connect RTT µs, or -1 on failure (no caps needed).
    fn ist_tcp_rtt_us(host: *const c_char, port: u16, timeout_ms: c_uint) -> i64;
}

// ── Public safe wrappers ──────────────────────────────────────────────────────

/// Perform a real ICMP echo to `host`.
///
/// Returns `Some(rtt_ms)` on success, `None` when CAP_NET_RAW is unavailable,
/// the host is unreachable, or the timeout elapses.
pub fn icmp_ping(host: &str, timeout_ms: u32) -> Option<f64> {
    let c_host = CString::new(host).ok()?;
    let us = unsafe { ist_icmp_ping(c_host.as_ptr(), timeout_ms) };
    if us > 0 {
        // microseconds → milliseconds, 2 decimal places
        Some((us as f64 / 1000.0 * 100.0).round() / 100.0)
    } else {
        None
    }
}

/// Perform a TCP-connect RTT measurement via C (non-blocking select() loop).
///
/// Uses `ist_tcp_rtt_us` which performs a non-blocking connect with `select()`
/// for accurate timeout handling at the C level rather than OS-level TCP stack.
pub fn tcp_rtt_c(host: &str, port: u16, timeout_ms: u32) -> Option<f64> {
    let c_host = CString::new(host).ok()?;
    let us = unsafe { ist_tcp_rtt_us(c_host.as_ptr(), port, timeout_ms) };
    if us > 0 {
        Some((us as f64 / 1000.0 * 100.0).round() / 100.0)
    } else {
        None
    }
}

/// Return the current CLOCK_MONOTONIC_RAW timestamp in nanoseconds.
/// Immune to NTP slew — use for measuring intervals inside the process.
#[allow(dead_code)]
pub fn monotonic_ns() -> u64 {
    unsafe { ist_monotonic_ns() }
}

/// Return a high-resolution timestamp in milliseconds (float).
#[allow(dead_code)]
pub fn monotonic_ms() -> f64 {
    monotonic_ns() as f64 / 1_000_000.0
}
