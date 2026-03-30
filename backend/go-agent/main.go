package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync/atomic"
	"time"
)

// ── Globals ───────────────────────────────────────────────────────────────────

var (
	cfg   Config
	lru   *LRUCache
	hub   *EventHub

	// Prometheus-style counters
	totalRequests atomic.Int64
	cacheHits     atomic.Int64
	cacheMisses   atomic.Int64
	eventsIn      atomic.Int64
)

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	cfg = loadConfig()
	lru = newLRUCache(cfg.CacheMaxSize, cfg.CacheTTL)
	hub = newHub()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	mux := http.NewServeMux()

	// Public endpoints (no auth required)
	mux.HandleFunc("GET /health",            handleHealth)
	mux.HandleFunc("GET /metrics",           handleMetrics)

	// Cache API
	mux.HandleFunc("GET /cache/{key}",       handleCacheGet)
	mux.HandleFunc("POST /cache",            handleCacheSet)
	mux.HandleFunc("DELETE /cache/{key}",    handleCacheDelete)

	// Event hub — push broadcasts to SSE subscribers
	mux.HandleFunc("POST /events/push",      handleEventPush)
	mux.HandleFunc("GET /events/subscribe",  hub.ServeSSE)

	srv := &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", cfg.Port),
		Handler:      middleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // must be 0 for SSE long-lived streams
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("go-agent starting",
		"port", cfg.Port,
		"cache_max", cfg.CacheMaxSize,
		"cache_ttl", cfg.CacheTTL,
		"auth", cfg.ServiceToken != "",
	)

	if err := srv.ListenAndServe(); err != nil {
		slog.Error("go-agent crashed", "err", err)
		os.Exit(1)
	}
}

// ── Middleware ────────────────────────────────────────────────────────────────

func middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		totalRequests.Add(1)

		// Service-to-service auth: skip for health + metrics endpoints
		path := r.URL.Path
		if cfg.ServiceToken != "" && path != "/health" && path != "/metrics" {
			if r.Header.Get("X-Service-Token") != cfg.ServiceToken {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"unauthorized"}`)) //nolint:errcheck
				return
			}
		}

		// Default Content-Type for non-SSE responses
		if path != "/events/subscribe" {
			w.Header().Set("Content-Type", "application/json")
		}

		next.ServeHTTP(w, r)
	})
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /health
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	size, max := lru.Stats()
	resp := map[string]any{
		"status":       "ok",
		"version":      "1.0.0",
		"cache_size":   size,
		"cache_max":    max,
		"sse_clients":  hub.ClientCount(),
		"uptime":       time.Now().UTC().Format(time.RFC3339),
	}
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// GET /metrics  (Prometheus text format — no external dependencies)
func handleMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	cacheSize, _ := lru.Stats()
	fmt.Fprintf(w, //nolint:errcheck
		`# HELP ist_agent_requests_total Total HTTP requests to go-agent
# TYPE ist_agent_requests_total counter
ist_agent_requests_total %d

# HELP ist_agent_cache_hits_total LRU cache hits
# TYPE ist_agent_cache_hits_total counter
ist_agent_cache_hits_total %d

# HELP ist_agent_cache_misses_total LRU cache misses
# TYPE ist_agent_cache_misses_total counter
ist_agent_cache_misses_total %d

# HELP ist_agent_cache_size Current entries in LRU cache
# TYPE ist_agent_cache_size gauge
ist_agent_cache_size %d

# HELP ist_agent_sse_clients Current SSE subscriber count
# TYPE ist_agent_sse_clients gauge
ist_agent_sse_clients %d

# HELP ist_agent_events_pushed_total Events pushed to broadcast hub
# TYPE ist_agent_events_pushed_total counter
ist_agent_events_pushed_total %d
`,
		totalRequests.Load(),
		cacheHits.Load(),
		cacheMisses.Load(),
		cacheSize,
		hub.ClientCount(),
		eventsIn.Load(),
	)
}

// GET /cache/{key}
func handleCacheGet(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if key == "" {
		writeErr(w, http.StatusBadRequest, "missing key")
		return
	}
	val, ok := lru.Get(key)
	if !ok {
		cacheMisses.Add(1)
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	cacheHits.Add(1)
	w.Write(val) //nolint:errcheck
}

// POST /cache
// Body: {"key":"...", "value": <any JSON>, "ttl_seconds": 60}
func handleCacheSet(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, cfg.MaxBodyBytes))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "read error")
		return
	}
	var req struct {
		Key        string          `json:"key"`
		Value      json.RawMessage `json:"value"`
		TTLSeconds int             `json:"ttl_seconds"`
	}
	if err := json.Unmarshal(body, &req); err != nil || req.Key == "" || len(req.Value) == 0 {
		writeErr(w, http.StatusBadRequest, "invalid body — need {key, value, ttl_seconds}")
		return
	}
	ttl := time.Duration(req.TTLSeconds) * time.Second
	lru.Set(req.Key, req.Value, ttl)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "key": req.Key}) //nolint:errcheck
}

// DELETE /cache/{key}
func handleCacheDelete(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	lru.Delete(key)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
}

// POST /events/push
// Body: any JSON object.  Broadcasts to all SSE subscribers.
func handleEventPush(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, cfg.MaxBodyBytes))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "read error")
		return
	}
	if !json.Valid(body) {
		writeErr(w, http.StatusBadRequest, "body must be valid JSON")
		return
	}
	hub.Broadcast(string(body))
	eventsIn.Add(1)
	json.NewEncoder(w).Encode(map[string]any{ //nolint:errcheck
		"status":  "pushed",
		"clients": hub.ClientCount(),
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error":%q}`, msg) //nolint:errcheck
}
