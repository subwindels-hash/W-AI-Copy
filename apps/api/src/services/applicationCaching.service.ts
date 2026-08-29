/**
 * Application Caching Service (Module 20 — Gap 1)
 *
 * Multi-layer caching with Redis and in-memory cache:
 * - L1: In-memory LRU cache (fastest, limited size)
 * - L2: Redis cache (fast, shared across instances)
 * - Cache-aside pattern (check cache, fetch on miss, populate cache)
 * - Write-through pattern (write to cache and database together)
 * - Read-through pattern (cache automatically fetches on miss)
 * - TTL-based expiration
 * - Cache invalidation
 * - Cache statistics and monitoring
 *
 * Reduces database load and improves response times.
 */
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";

// ─── Types ──────────────────────────────────────────────────────

export interface CacheOptions {
  ttl?: number; // Time-to-live in seconds
  tags?: string[]; // Cache tags for bulk invalidation
  namespace?: string; // Cache namespace
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
}

interface LRUNode<K, V> {
  key: K;
  value: V;
  prev?: LRUNode<K, V>;
  next?: LRUNode<K, V>;
  expiresAt?: number;
}

// ─── L1: In-Memory LRU Cache ────────────────────────────────────

class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, LRUNode<K, V>>;
  private head?: LRUNode<K, V>;
  private tail?: LRUNode<K, V>;
  private _size: number = 0;
  private _hits: number = 0;
  private _misses: number = 0;
  private _evictions: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);

    if (!node) {
      this._misses++;
      Metrics.increment("cache.l1.miss", 1);
      return undefined;
    }

    // Check expiration
    if (node.expiresAt && Date.now() > node.expiresAt) {
      this.delete(key);
      this._misses++;
      Metrics.increment("cache.l1.miss", 1);
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    this._hits++;
    Metrics.increment("cache.l1.hit", 1);
    return node.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const existing = this.map.get(key);

    if (existing) {
      existing.value = value;
      existing.expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
      this.moveToFront(existing);
      return;
    }

    const node: LRUNode<K, V> = {
      key,
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
    };

    this.map.set(key, node);
    this.addToFront(node);
    this._size++;

    // Evict if over capacity
    if (this._size > this.capacity) {
      this.evict();
    }
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.map.delete(key);
    this._size--;
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
    this._size = 0;
  }

  get size(): number {
    return this._size;
  }

  get stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
      size: this._size,
      evictions: this._evictions,
    };
  }

  private addToFront(node: LRUNode<K, V>): void {
    node.prev = undefined;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    this.removeNode(node);
    this.addToFront(node);
  }

  private evict(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);
    this._size--;
    this._evictions++;
    Metrics.increment("cache.l1.eviction", 1);
  }
}

// ─── L2: Redis Cache ────────────────────────────────────────────

class RedisCache {
  private namespace: string;
  private tagMap: Map<string, Set<string>> = new Map();

  constructor(namespace: string = "app") {
    this.namespace = namespace;
  }

  private key(key: string): string {
    return `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await redisCmd.get(this.key(key));

      if (!value) {
        Metrics.increment("cache.l2.miss", 1);
        return undefined;
      }

      Metrics.increment("cache.l2.hit", 1);
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error("Redis cache get error", { key, error });
      Metrics.increment("cache.l2.error", 1);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl ?? 300; // Default 5 minutes
      const serialized = JSON.stringify(value);

      if (ttl > 0) {
        await redisCmd.setex(this.key(key), ttl, serialized);
      } else {
        await redisCmd.set(this.key(key), serialized);
      }

      // Track tags for bulk invalidation
      if (options?.tags) {
        for (const tag of options.tags) {
          if (!this.tagMap.has(tag)) {
            this.tagMap.set(tag, new Set());
          }
          this.tagMap.get(tag)!.add(key);
        }
      }
    } catch (error) {
      logger.error("Redis cache set error", { key, error });
      Metrics.increment("cache.l2.error", 1);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await redisCmd.del(this.key(key));
      return result > 0;
    } catch (error) {
      logger.error("Redis cache delete error", { key, error });
      return false;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    const keys = this.tagMap.get(tag);
    if (!keys || keys.size === 0) return 0;

    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }

    this.tagMap.delete(tag);
    Metrics.increment("cache.l2.invalidation", count, { tag });
    return count;
  }

  async clear(): Promise<void> {
    try {
      const pattern = `${this.namespace}:*`;
      const keys = await redisCmd.keys(pattern);

      if (keys.length > 0) {
        await redisCmd.del(...keys);
      }

      this.tagMap.clear();
      Metrics.increment("cache.l2.clear", 1);
    } catch (error) {
      logger.error("Redis cache clear error", { error });
    }
  }
}

// ─── Multi-Layer Cache Manager ──────────────────────────────────

class CacheManager {
  private l1Cache: LRUCache<string, any>;
  private l2Cache: RedisCache;

  constructor(l1Capacity: number = 1000, namespace: string = "app") {
    this.l1Cache = new LRUCache(l1Capacity);
    this.l2Cache = new RedisCache(namespace);
  }

  /**
   * Get value from cache (L1 → L2 → miss)
   */
  async get<T>(key: string): Promise<T | undefined> {
    // Try L1 first
    const l1Value = this.l1Cache.get(key);
    if (l1Value !== undefined) {
      return l1Value as T;
    }

    // Try L2
    const l2Value = await this.l2Cache.get<T>(key);
    if (l2Value !== undefined) {
      // Populate L1
      this.l1Cache.set(key, l2Value);
      return l2Value;
    }

    return undefined;
  }

  /**
   * Set value in cache (L1 + L2)
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttl ?? 300;

    // Set in L2 first (shared across instances)
    await this.l2Cache.set(key, value, options);

    // Set in L1 (local to this instance)
    this.l1Cache.set(key, value, ttl);
  }

  /**
   * Cache-aside pattern: get from cache or fetch and cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Delete from cache (L1 + L2)
   */
  async delete(key: string): Promise<boolean> {
    this.l1Cache.delete(key);
    return await this.l2Cache.delete(key);
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    // L1 doesn't support tags, so we clear it
    this.l1Cache.clear();
    return await this.l2Cache.invalidateByTag(tag);
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    await this.l2Cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { l1: CacheStats; l2: { namespace: string } } {
    return {
      l1: this.l1Cache.stats,
      l2: { namespace: this.l2Cache["namespace"] },
    };
  }
}

// ─── Singleton Instance ─────────────────────────────────────────

export const cache = new CacheManager(
  parseInt(process.env.CACHE_L1_CAPACITY || "1000"),
  process.env.CACHE_NAMESPACE || "windels",
);

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Decorator for caching function results
 */
export function cached(
  keyGenerator: (...args: any[]) => string,
  options?: CacheOptions,
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = keyGenerator(...args);
      return cache.getOrSet(key, () => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Invalidate cache by tag
 */
export async function invalidateCacheTag(tag: string): Promise<number> {
  return cache.invalidateByTag(tag);
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  await cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return cache.getStats();
}
