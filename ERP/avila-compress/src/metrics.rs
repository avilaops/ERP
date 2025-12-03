//! Compression metrics and observability

use std::time::{Duration, Instant};

/// Compression metrics for observability
#[derive(Debug, Clone)]
pub struct CompressionMetrics {
    /// Algorithm used (e.g., "LZ4-Fast", "LZ4-Best", "Dictionary")
    pub algorithm: String,

    /// Original uncompressed size in bytes
    pub original_size: usize,

    /// Compressed size in bytes
    pub compressed_size: usize,

    /// Time taken to compress
    pub compress_duration: Duration,

    /// Time taken to decompress (if available)
    pub decompress_duration: Option<Duration>,

    /// Checksum of original data (xxHash64)
    pub checksum: u64,
}

impl CompressionMetrics {
    /// Calculate compression ratio (compressed / original)
    pub fn ratio(&self) -> f64 {
        if self.original_size == 0 {
            return 1.0;
        }
        self.compressed_size as f64 / self.original_size as f64
    }

    /// Calculate compression percentage saved
    pub fn savings_percent(&self) -> f64 {
        (1.0 - self.ratio()) * 100.0
    }

    /// Calculate compression throughput in MB/s
    pub fn compress_throughput_mbps(&self) -> f64 {
        let mb = self.original_size as f64 / (1024.0 * 1024.0);
        let secs = self.compress_duration.as_secs_f64();
        if secs == 0.0 {
            return 0.0;
        }
        mb / secs
    }

    /// Calculate decompression throughput in MB/s
    pub fn decompress_throughput_mbps(&self) -> Option<f64> {
        self.decompress_duration.map(|duration| {
            let mb = self.original_size as f64 / (1024.0 * 1024.0);
            let secs = duration.as_secs_f64();
            if secs == 0.0 {
                return 0.0;
            }
            mb / secs
        })
    }

    /// Pretty-print metrics
    pub fn display(&self) -> String {
        let mut output = String::new();
        output.push_str(&format!("Algorithm: {}\n", self.algorithm));
        output.push_str(&format!("Original size: {} bytes\n", self.original_size));
        output.push_str(&format!("Compressed size: {} bytes\n", self.compressed_size));
        output.push_str(&format!("Ratio: {:.2}% ({:.2}x)\n", self.ratio() * 100.0, 1.0 / self.ratio()));
        output.push_str(&format!("Savings: {:.2}%\n", self.savings_percent()));
        output.push_str(&format!("Compress time: {:?}\n", self.compress_duration));
        output.push_str(&format!("Compress speed: {:.2} MB/s\n", self.compress_throughput_mbps()));

        if let Some(decompress_time) = self.decompress_duration {
            output.push_str(&format!("Decompress time: {:?}\n", decompress_time));
            output.push_str(&format!("Decompress speed: {:.2} MB/s\n",
                self.decompress_throughput_mbps().unwrap_or(0.0)));
        }

        output.push_str(&format!("Checksum: 0x{:016x}\n", self.checksum));
        output
    }
}

/// Compress with metrics tracking
pub fn compress_with_metrics(
    data: &[u8],
    algorithm: &str,
    compress_fn: impl FnOnce(&[u8]) -> crate::Result<Vec<u8>>,
) -> crate::Result<(Vec<u8>, CompressionMetrics)> {
    let checksum = crate::checksum::xxhash64(data, 0);
    let original_size = data.len();

    let start = Instant::now();
    let compressed = compress_fn(data)?;
    let compress_duration = start.elapsed();

    let metrics = CompressionMetrics {
        algorithm: algorithm.to_string(),
        original_size,
        compressed_size: compressed.len(),
        compress_duration,
        decompress_duration: None,
        checksum,
    };

    Ok((compressed, metrics))
}

/// Decompress with metrics tracking
pub fn decompress_with_metrics(
    compressed: &[u8],
    mut metrics: CompressionMetrics,
    decompress_fn: impl FnOnce(&[u8]) -> crate::Result<Vec<u8>>,
) -> crate::Result<(Vec<u8>, CompressionMetrics)> {
    let start = Instant::now();
    let decompressed = decompress_fn(compressed)?;
    let decompress_duration = start.elapsed();

    // Verify checksum
    let checksum = crate::checksum::xxhash64(&decompressed, 0);
    if checksum != metrics.checksum {
        return Err(crate::Error::CorruptedData(format!(
            "Checksum mismatch: expected 0x{:016x}, got 0x{:016x}",
            metrics.checksum, checksum
        )));
    }

    metrics.decompress_duration = Some(decompress_duration);

    Ok((decompressed, metrics))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_metrics_calculation() {
        let metrics = CompressionMetrics {
            algorithm: "LZ4-Fast".to_string(),
            original_size: 1000,
            compressed_size: 500,
            compress_duration: Duration::from_millis(10),
            decompress_duration: Some(Duration::from_millis(5)),
            checksum: 0x1234567890ABCDEF,
        };

        assert_eq!(metrics.ratio(), 0.5);
        assert_eq!(metrics.savings_percent(), 50.0);
        assert!(metrics.compress_throughput_mbps() > 0.0);
        assert!(metrics.decompress_throughput_mbps().is_some());
    }

    #[test]
    fn test_metrics_display() {
        let metrics = CompressionMetrics {
            algorithm: "Test".to_string(),
            original_size: 100,
            compressed_size: 50,
            compress_duration: Duration::from_millis(1),
            decompress_duration: None,
            checksum: 0xABCD,
        };

        let display = metrics.display();
        assert!(display.contains("Algorithm: Test"));
        assert!(display.contains("Original size: 100"));
        assert!(display.contains("Compressed size: 50"));
    }
}
