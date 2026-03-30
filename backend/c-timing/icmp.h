#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Send a raw ICMP Echo Request to `host` and return the RTT in microseconds.
 *
 * Requirements: CAP_NET_RAW or the binary must be setcap-enabled.
 * Returns -1  if:
 *   - raw socket cannot be created (no capability)
 *   - hostname cannot be resolved
 *   - timeout elapsed before reply arrived
 *
 * @param host        Hostname or dotted-decimal IPv4 address
 * @param timeout_ms  Receive timeout in milliseconds
 * @return            RTT in microseconds, or -1 on any failure
 */
int64_t ist_icmp_ping(const char *host, uint32_t timeout_ms);

/**
 * Return the current value of CLOCK_MONOTONIC_RAW in nanoseconds.
 * This is immune to NTP adjustments — ideal for interval timing.
 */
uint64_t ist_monotonic_ns(void);

/**
 * Attempt a TCP connect to host:port and return RTT in microseconds.
 * Works without any special capabilities.
 *
 * Returns -1 on connection failure or timeout.
 */
int64_t ist_tcp_rtt_us(const char *host, uint16_t port, uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif
