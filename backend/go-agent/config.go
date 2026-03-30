package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration sourced from environment variables.
// No value is hardcoded — every default can be overridden without recompiling.
type Config struct {
	// Port this service listens on (env: AGENT_PORT, default: 8002)
	Port int

	// Maximum number of entries in the LRU cache (env: AGENT_CACHE_MAX_SIZE, default: 2000)
	CacheMaxSize int

	// Default TTL for cache entries (env: AGENT_CACHE_TTL_SEC, default: 30)
	CacheTTL time.Duration

	// Shared secret for service-to-service authentication.
	// When set, every non-public request must include:
	//   X-Service-Token: <token>
	// (env: AGENT_SERVICE_TOKEN)
	ServiceToken string

	// Maximum body size accepted by POST endpoints in bytes (env: AGENT_MAX_BODY_BYTES, default: 512 KiB)
	MaxBodyBytes int64
}

func loadConfig() Config {
	return Config{
		Port:         envInt("AGENT_PORT", 8002),
		CacheMaxSize: envInt("AGENT_CACHE_MAX_SIZE", 2000),
		CacheTTL:     time.Duration(envInt("AGENT_CACHE_TTL_SEC", 30)) * time.Second,
		ServiceToken: envStr("AGENT_SERVICE_TOKEN", ""),
		MaxBodyBytes: int64(envInt("AGENT_MAX_BODY_BYTES", 512*1024)),
	}
}

func envStr(key, def string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	return v
}

func envInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
