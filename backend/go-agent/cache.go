package main

import (
	"container/list"
	"sync"
	"time"
)

// entry is the value stored in the LRU cache.
type entry struct {
	key       string
	value     []byte
	expiresAt time.Time
	elem      *list.Element // pointer back into the doubly-linked list
}

// LRUCache is a thread-safe LRU cache with per-entry TTL eviction.
//
// Eviction policy:
//   - When capacity is exceeded the least-recently-used entry is removed.
//   - Expired entries are lazily removed on Get and proactively swept by a
//     background goroutine every 10 seconds.
type LRUCache struct {
	mu      sync.Mutex
	maxSize int
	defTTL  time.Duration
	items   map[string]*entry
	order   *list.List // front = most-recently used
}

// newLRUCache creates a cache with the given capacity and default TTL.
// A background goroutine is started to periodically sweep expired entries.
func newLRUCache(maxSize int, defTTL time.Duration) *LRUCache {
	c := &LRUCache{
		maxSize: maxSize,
		defTTL:  defTTL,
		items:   make(map[string]*entry, maxSize),
		order:   list.New(),
	}
	go c.sweepLoop()
	return c
}

// Get retrieves a value by key.  Returns (value, true) on a cache hit,
// or (nil, false) on a miss or expiry.
func (c *LRUCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.items[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(e.expiresAt) {
		c.remove(e)
		return nil, false
	}
	// Promote to front of the LRU list
	c.order.MoveToFront(e.elem)
	return e.value, true
}

// Set inserts or updates a key.  ttl ≤ 0 uses the cache's default TTL.
func (c *LRUCache) Set(key string, value []byte, ttl time.Duration) {
	if ttl <= 0 {
		ttl = c.defTTL
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.items[key]; ok {
		// Update in place and promote
		e.value     = value
		e.expiresAt = time.Now().Add(ttl)
		c.order.MoveToFront(e.elem)
		return
	}

	// Evict the LRU entry when at capacity
	for len(c.items) >= c.maxSize {
		c.evictLRU()
	}

	e := &entry{
		key:       key,
		value:     value,
		expiresAt: time.Now().Add(ttl),
	}
	e.elem = c.order.PushFront(e)
	c.items[key] = e
}

// Delete removes a key from the cache (no-op if absent).
func (c *LRUCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[key]; ok {
		c.remove(e)
	}
}

// Stats returns the current number of entries and the maximum capacity.
func (c *LRUCache) Stats() (size, maxSize int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items), c.maxSize
}

// ── internal helpers (must be called with mu held) ────────────────────────────

func (c *LRUCache) remove(e *entry) {
	c.order.Remove(e.elem)
	delete(c.items, e.key)
}

func (c *LRUCache) evictLRU() {
	if back := c.order.Back(); back != nil {
		c.remove(back.Value.(*entry))
	}
}

// sweepLoop runs a proactive TTL sweep every 10 seconds in the background.
// This keeps memory usage bounded even for infrequently-accessed keys.
func (c *LRUCache) sweepLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		c.mu.Lock()
		for _, e := range c.items {
			if now.After(e.expiresAt) {
				c.remove(e)
			}
		}
		c.mu.Unlock()
	}
}
