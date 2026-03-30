/**
 * IST — C timing & ICMP probe library
 *
 * Provides:
 *   ist_icmp_ping()   — real ICMP echo (needs CAP_NET_RAW)
 *   ist_monotonic_ns() — CLOCK_MONOTONIC_RAW nanoseconds
 *   ist_tcp_rtt_us()  — TCP connect RTT (no special caps needed)
 *
 * Build:
 *   gcc -O2 -Wall -Wextra -o libisttime.a -c icmp.c && ar rcs libisttime.a icmp.o
 */

#define _GNU_SOURCE

#include "icmp.h"

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/ip_icmp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

/* ── Internal helpers ────────────────────────────────────────────────────── */

static uint16_t icmp_checksum(void *buf, int len) {
    unsigned short *ptr = (unsigned short *)buf;
    unsigned int    sum = 0;

    for (; len > 1; len -= 2)
        sum += *ptr++;
    if (len == 1)
        sum += *(unsigned char *)ptr;

    sum  = (sum >> 16) + (sum & 0xFFFF);
    sum += (sum >> 16);
    return (uint16_t)(~sum);
}

/* ── CLOCK_MONOTONIC_RAW ─────────────────────────────────────────────────── */

uint64_t ist_monotonic_ns(void) {
    struct timespec ts;
    /*
     * CLOCK_MONOTONIC_RAW: not adjusted by NTP/adjtime — ideal for measuring
     * short intervals without drift interference.
     */
    if (clock_gettime(CLOCK_MONOTONIC_RAW, &ts) != 0) {
        /* Fallback to CLOCK_MONOTONIC if RAW is unavailable */
        clock_gettime(CLOCK_MONOTONIC, &ts);
    }
    return (uint64_t)ts.tv_sec * UINT64_C(1000000000) + (uint64_t)ts.tv_nsec;
}

/* ── Raw ICMP echo ───────────────────────────────────────────────────────── */

int64_t ist_icmp_ping(const char *host, uint32_t timeout_ms) {
    if (!host) return -1;

    /* Resolve hostname */
    struct addrinfo hints, *res = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_RAW;
    hints.ai_protocol = IPPROTO_ICMP;

    if (getaddrinfo(host, NULL, &hints, &res) != 0 || !res) {
        freeaddrinfo(res);
        return -1;
    }

    int sock = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
    if (sock < 0) {
        /* CAP_NET_RAW not available — return -1 so caller can use TCP fallback */
        freeaddrinfo(res);
        return -1;
    }

    /* Set receive timeout */
    struct timeval tv = {
        .tv_sec  = (time_t)(timeout_ms / 1000),
        .tv_usec = (suseconds_t)((timeout_ms % 1000) * 1000),
    };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    /* Build ICMP echo request (64-byte packet) */
    unsigned char pkt[64];
    memset(pkt, 0, sizeof(pkt));
    struct icmphdr *hdr = (struct icmphdr *)pkt;
    hdr->type             = ICMP_ECHO;
    hdr->code             = 0;
    hdr->un.echo.id       = (uint16_t)(getpid() & 0xFFFF);
    hdr->un.echo.sequence = 1;
    /* Fill payload with a recognisable pattern */
    for (size_t i = sizeof(*hdr); i < sizeof(pkt); i++)
        pkt[i] = (unsigned char)(i & 0xFF);
    hdr->checksum = icmp_checksum(pkt, sizeof(pkt));

    uint64_t t0 = ist_monotonic_ns();

    ssize_t sent = sendto(sock, pkt, sizeof(pkt), 0, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);

    if (sent < 0) {
        close(sock);
        return -1;
    }

    /* Wait for echo reply */
    unsigned char reply[256];
    struct sockaddr_in from;
    socklen_t fromlen = sizeof(from);

    ssize_t n = recvfrom(sock, reply, sizeof(reply), 0,
                         (struct sockaddr *)&from, &fromlen);
    uint64_t t1 = ist_monotonic_ns();
    close(sock);

    if (n < 0) return -1;

    /* Verify it's an echo reply */
    struct iphdr   *iph  = (struct iphdr *)reply;
    int             ihl  = iph->ihl * 4;
    struct icmphdr *rhdr = (struct icmphdr *)(reply + ihl);

    if (rhdr->type != ICMP_ECHOREPLY) return -1;
    if (rhdr->un.echo.id != hdr->un.echo.id) return -1;

    int64_t us = (int64_t)((t1 - t0) / 1000ULL);
    return us > 0 ? us : 1;
}

/* ── TCP connect RTT ─────────────────────────────────────────────────────── */

int64_t ist_tcp_rtt_us(const char *host, uint16_t port, uint32_t timeout_ms) {
    if (!host) return -1;

    char port_str[8];
    snprintf(port_str, sizeof(port_str), "%u", (unsigned)port);

    struct addrinfo hints, *res = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family   = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    if (getaddrinfo(host, port_str, &hints, &res) != 0 || !res) {
        freeaddrinfo(res);
        return -1;
    }

    int sock = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sock < 0) {
        freeaddrinfo(res);
        return -1;
    }

    /* Non-blocking connect with select() for precise timeout */
    fcntl(sock, F_SETFL, O_NONBLOCK);

    uint64_t t0 = ist_monotonic_ns();
    int rc = connect(sock, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);

    if (rc < 0 && errno != EINPROGRESS) {
        close(sock);
        return -1;
    }

    fd_set wset;
    FD_ZERO(&wset);
    FD_SET(sock, &wset);

    struct timeval tv = {
        .tv_sec  = (time_t)(timeout_ms / 1000),
        .tv_usec = (suseconds_t)((timeout_ms % 1000) * 1000),
    };

    int sel = select(sock + 1, NULL, &wset, NULL, &tv);
    uint64_t t1 = ist_monotonic_ns();
    close(sock);

    if (sel <= 0) return -1; /* timeout or error */

    int64_t us = (int64_t)((t1 - t0) / 1000ULL);
    return us > 0 ? us : 1;
}
