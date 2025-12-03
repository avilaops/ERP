//! Query result cache for performance optimization

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::query::QueryResult;

/// Cache key for queries
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey {
    collection: String,
    query: String,
    params_hash: u64,
}

impl CacheKey {
    pub fn new(collection: String, query: String, params: &serde_json::Value) -> Self {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        params.to_string().hash(&mut hasher);

        Self {
            collection,
            query,
            params_hash: hasher.finish(),
        }
    }
}

/// Cached query result with metadata
#[derive(Debug, Clone)]
pub struct CachedResult {
    pub result: QueryResult,
    pub inserted_at: Instant,
    pub hit_count: u64,
    pub last_access: Instant,
}

/// Query cache configuration
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// Maximum number of cached queries
    pub max_entries: usize,
    /// Time-to-live for cached results
    pub ttl: Duration,
    /// Enable cache statistics
    pub track_stats: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_entries: 1000,
            ttl: Duration::from_secs(300), // 5 minutes
            track_stats: true,
        }
    }
}

/// Query result cache
pub struct QueryCache {
    config: CacheConfig,
    cache: Arc<RwLock<HashMap<CacheKey, CachedResult>>>,
    stats: Arc<RwLock<CacheStats>>,
}

/// Cache statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub insertions: u64,
    pub total_size: usize,
}

impl CacheStats {
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            self.hits as f64 / total as f64
        }
    }
}

impl QueryCache {
    /// Create new query cache with configuration
    pub fn new(config: CacheConfig) -> Self {
        Self {
            config,
            cache: Arc::new(RwLock::new(HashMap::new())),
            stats: Arc::new(RwLock::new(CacheStats::default())),
        }
    }

    /// Get cached query result
    pub async fn get(&self, key: &CacheKey) -> Option<QueryResult> {
        let mut cache = self.cache.write().await;

        if let Some(entry) = cache.get_mut(key) {
            // Check if entry is still valid
            if entry.inserted_at.elapsed() < self.config.ttl {
                entry.hit_count += 1;
                entry.last_access = Instant::now();

                if self.config.track_stats {
                    let mut stats = self.stats.write().await;
                    stats.hits += 1;
                }

                return Some(entry.result.clone());
            } else {
                // Entry expired, remove it
                cache.remove(key);

                if self.config.track_stats {
                    let mut stats = self.stats.write().await;
                    stats.evictions += 1;
                }
            }
        }

        if self.config.track_stats {
            let mut stats = self.stats.write().await;
            stats.misses += 1;
        }

        None
    }

    /// Insert query result into cache
    pub async fn insert(&self, key: CacheKey, result: QueryResult) {
        let mut cache = self.cache.write().await;

        // Evict old entries if cache is full
        if cache.len() >= self.config.max_entries {
            self.evict_lru(&mut cache).await;
        }

        let cached = CachedResult {
            result,
            inserted_at: Instant::now(),
            hit_count: 0,
            last_access: Instant::now(),
        };

        cache.insert(key, cached);

        if self.config.track_stats {
            let mut stats = self.stats.write().await;
            stats.insertions += 1;
            stats.total_size = cache.len();
        }
    }

    /// Evict least recently used entry
    async fn evict_lru(&self, cache: &mut HashMap<CacheKey, CachedResult>) {
        if let Some((key, _)) = cache
            .iter()
            .min_by_key(|(_, v)| v.last_access)
            .map(|(k, v)| (k.clone(), v.clone()))
        {
            cache.remove(&key);

            if self.config.track_stats {
                let mut stats = self.stats.write().await;
                stats.evictions += 1;
            }
        }
    }

    /// Invalidate cache entries for a collection
    pub async fn invalidate_collection(&self, collection: &str) {
        let mut cache = self.cache.write().await;
        cache.retain(|key, _| key.collection != collection);

        if self.config.track_stats {
            let mut stats = self.stats.write().await;
            stats.total_size = cache.len();
        }
    }

    /// Clear entire cache
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();

        if self.config.track_stats {
            let mut stats = self.stats.write().await;
            *stats = CacheStats::default();
        }
    }

    /// Get cache statistics
    pub async fn stats(&self) -> CacheStats {
        self.stats.read().await.clone()
    }

    /// Get current cache size
    pub async fn size(&self) -> usize {
        self.cache.read().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_result() -> QueryResult {
        QueryResult {
            documents: vec![],
            total_count: 0,
            latency_ms: 10,
            compression_ratio: 1.0,
        }
    }

    #[tokio::test]
    async fn test_cache_insert_and_get() {
        let cache = QueryCache::new(CacheConfig::default());
        let key = CacheKey::new(
            "test".to_string(),
            "SELECT *".to_string(),
            &serde_json::json!({}),
        );
        let result = create_test_result();

        cache.insert(key.clone(), result.clone()).await;
        let cached = cache.get(&key).await;

        assert!(cached.is_some());
    }

    #[tokio::test]
    async fn test_cache_miss() {
        let cache = QueryCache::new(CacheConfig::default());
        let key = CacheKey::new(
            "test".to_string(),
            "SELECT *".to_string(),
            &serde_json::json!({}),
        );

        let cached = cache.get(&key).await;
        assert!(cached.is_none());
    }

    #[tokio::test]
    async fn test_cache_ttl() {
        let config = CacheConfig {
            ttl: Duration::from_millis(100),
            ..Default::default()
        };
        let cache = QueryCache::new(config);
        let key = CacheKey::new(
            "test".to_string(),
            "SELECT *".to_string(),
            &serde_json::json!({}),
        );
        let result = create_test_result();

        cache.insert(key.clone(), result.clone()).await;

        // Wait for TTL to expire
        tokio::time::sleep(Duration::from_millis(150)).await;

        let cached = cache.get(&key).await;
        assert!(cached.is_none());
    }

    #[tokio::test]
    async fn test_cache_eviction() {
        let config = CacheConfig {
            max_entries: 2,
            ..Default::default()
        };
        let cache = QueryCache::new(config);

        // Insert 3 entries (should evict oldest)
        for i in 0..3 {
            let key = CacheKey::new(
                "test".to_string(),
                format!("SELECT {}", i),
                &serde_json::json!({}),
            );
            cache.insert(key, create_test_result()).await;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        assert_eq!(cache.size().await, 2);
    }

    #[tokio::test]
    async fn test_cache_stats() {
        let cache = QueryCache::new(CacheConfig::default());
        let key = CacheKey::new(
            "test".to_string(),
            "SELECT *".to_string(),
            &serde_json::json!({}),
        );
        let result = create_test_result();

        cache.insert(key.clone(), result).await;
        cache.get(&key).await; // Hit
        cache.get(&CacheKey::new("test".to_string(), "OTHER".to_string(), &serde_json::json!({}))).await; // Miss

        let stats = cache.stats().await;
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.insertions, 1);
    }

    #[tokio::test]
    async fn test_invalidate_collection() {
        let cache = QueryCache::new(CacheConfig::default());

        let key1 = CacheKey::new("coll1".to_string(), "SELECT *".to_string(), &serde_json::json!({}));
        let key2 = CacheKey::new("coll2".to_string(), "SELECT *".to_string(), &serde_json::json!({}));

        cache.insert(key1.clone(), create_test_result()).await;
        cache.insert(key2.clone(), create_test_result()).await;

        cache.invalidate_collection("coll1").await;

        assert!(cache.get(&key1).await.is_none());
        assert!(cache.get(&key2).await.is_some());
    }
}
