package main

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// sseClient represents one SSE subscriber (typically one Python uvicorn worker).
type sseClient struct {
	ch chan string
}

// EventHub manages a set of SSE subscribers and broadcasts events to all of them.
//
// Architecture:
//   Python uvicorn workers → POST /events/push → hub.Broadcast()
//                                                     ↓
//                                        SSE streams → Python WS handlers → browser clients
//
// This solves the multi-worker broadcast problem: all uvicorn workers subscribe
// to this single hub so every speed-test result reaches every WebSocket client
// regardless of which worker handled the measurement.
type EventHub struct {
	mu        sync.RWMutex
	clients   map[*sseClient]bool
	broadcast chan string
}

func newHub() *EventHub {
	h := &EventHub{
		clients:   make(map[*sseClient]bool),
		broadcast: make(chan string, 1024),
	}
	go h.run()
	return h
}

// run is the single goroutine that fans out broadcast messages.
// Using a dedicated goroutine avoids locking issues in the publish path.
func (h *EventHub) run() {
	for msg := range h.broadcast {
		h.mu.RLock()
		for client := range h.clients {
			select {
			case client.ch <- msg:
				// delivered
			default:
				// Subscriber is too slow — drop the event rather than block.
				// The Python worker will re-sync on the next event.
			}
		}
		h.mu.RUnlock()
	}
}

// Broadcast sends a JSON string to all current SSE subscribers.
// Non-blocking: if the internal buffer is full the event is dropped.
func (h *EventHub) Broadcast(data string) {
	select {
	case h.broadcast <- data:
	default:
		// Hub buffer full — event dropped
	}
}

// ClientCount returns the current number of SSE subscribers.
func (h *EventHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ServeSSE handles GET /events/subscribe.
//
// This is a long-lived Server-Sent Events stream.  Each uvicorn worker that
// handles a WebSocket connection opens one SSE subscription here, then
// forwards every event it receives to its WebSocket clients.
func (h *EventHub) ServeSSE(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering

	client := &sseClient{ch: make(chan string, 128)}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, client)
		h.mu.Unlock()
	}()

	heartbeat := time.NewTicker(10 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return

		case msg := <-client.ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			fl.Flush()

		case <-heartbeat.C:
			fmt.Fprintf(w, "event: heartbeat\ndata: {\"ts\":%q,\"clients\":%d}\n\n",
				time.Now().UTC().Format(time.RFC3339),
				h.ClientCount(),
			)
			fl.Flush()
		}
	}
}
