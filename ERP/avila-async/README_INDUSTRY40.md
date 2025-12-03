# Avila Async - Industry 4.0

[![Crates.io](https://img.shields.io/crates/v/avila-async.svg)](https://crates.io/crates/avila-async)
[![Documentation](https://docs.rs/avila-async/badge.svg)](https://docs.rs/avila-async)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg)](LICENSE)

🏭 **Enterprise-grade async runtime for Rust with Industry 4.0 features** - Real-time metrics, distributed tracing, health monitoring, and auto-scaling. Zero external dependencies.

## 🚀 Industry 4.0 Features

### 📊 Real-Time Metrics
- Task execution metrics (spawn/complete/fail rates)
- Queue depth monitoring
- Thread utilization tracking
- Performance percentiles (P50, P95, P99)
- Throughput measurement (tasks/second)
- Prometheus export format
- Custom counters and gauges

### 🔍 Distributed Tracing
- Context propagation across async boundaries
- Span tracking with parent-child relationships
- Event logging within spans
- Jaeger export format
- Trace ID and Span ID generation
- Custom attributes support

### 🏥 Health Monitoring
- Readiness probes (can accept new work)
- Liveness probes (runtime functioning)
- Heartbeat tracking
- Custom health checks
- Degraded state detection
- JSON export for integration

### ⚙️ Auto-Scaling
- Dynamic thread pool adjustment
- Workload-based scaling decisions
- Configurable thresholds
- Cooldown periods
- Resource limits enforcement
- Scale up/down monitoring

### 🛡️ Resource Management
- Maximum queue size limits
- Task duration limits
- Memory constraints
- CPU utilization monitoring
- Graceful degradation

## Installation

```toml
[dependencies]
avila-async = "0.3"
```

## Quick Start

### Basic Usage

```rust
use avila_async::Runtime;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        println!("Hello Industry 4.0!");
    });
}
```

### With Industry 4.0 Configuration

```rust
use avila_async::{Runtime, RuntimeConfig, ScalingConfig, ResourceLimits};
use std::time::Duration;

fn main() {
    let config = RuntimeConfig {
        num_threads: Some(8),
        enable_autoscaling: true,
        scaling_config: ScalingConfig {
            min_threads: 2,
            max_threads: 16,
            target_queue_length: 100,
            scale_up_threshold: 0.8,
            scale_down_threshold: 0.3,
            cooldown_period: Duration::from_secs(30),
        },
        resource_limits: ResourceLimits {
            max_queue_size: Some(1000),
            max_task_duration: Some(Duration::from_secs(300)),
            ..Default::default()
        },
    };

    let rt = Runtime::with_config(config);

    rt.block_on(async {
        // Your application code
    });
}
```

## 📊 Metrics Example

```rust
use avila_async::Runtime;
use std::time::Duration;

fn main() {
    let rt = Runtime::new();

    rt.block_on(async move {
        // Spawn some tasks
        for i in 0..100 {
            rt.spawn(async move {
                avila_async::sleep(Duration::from_millis(100)).await;
            });
        }

        // Get metrics snapshot
        let metrics = rt.metrics().snapshot();
        println!("Tasks spawned: {}", metrics.tasks_spawned);
        println!("Queue length: {}", metrics.queue_length);
        println!("Avg execution time: {:?}", metrics.avg_execution_time);
        println!("P95 execution time: {:?}", metrics.p95_execution_time);
        println!("Throughput: {} tasks/sec", metrics.tasks_per_second);

        // Export to Prometheus
        println!("{}", rt.metrics().to_prometheus());
    });
}
```

## 🔍 Distributed Tracing

```rust
use avila_async::{Runtime, TraceContext};
use std::time::Duration;

async fn process_order(ctx: &TraceContext, order_id: u64) {
    let mut span = ctx.child_span("process_order");
    span.set_attribute("order_id", order_id.to_string());
    span.add_event("order_started");

    // Do work
    avila_async::sleep(Duration::from_millis(100)).await;

    span.add_event("order_completed");
    let completed = span.end();
    println!("{}", completed);
}

fn main() {
    let rt = Runtime::new();

    rt.block_on(async {
        let ctx = TraceContext::new("my-service");
        process_order(&ctx, 12345).await;

        // Export traces
        println!("{}", rt.tracer().to_jaeger_json());
    });
}
```

## 🏥 Health Monitoring

```rust
use avila_async::{Runtime, HealthStatus};

fn main() {
    let rt = Runtime::new();

    rt.block_on(async move {
        // Check health status
        let health = rt.health().get_report();
        println!("Status: {}", health.status);
        println!("Ready: {}", health.ready);
        println!("Alive: {}", health.alive);

        // Add custom health check
        rt.health().add_check(
            "database",
            HealthStatus::Healthy,
            "Connected"
        );

        // Export as JSON
        let report = rt.health().get_report();
        println!("{}", report.to_json());
    });
}
```

## API Overview

### Runtime Configuration

- `Runtime::new()` - Create runtime with defaults
- `Runtime::with_config(config)` - Create with custom configuration
- `runtime.metrics()` - Access metrics collector
- `runtime.health()` - Access health checker
- `runtime.tracer()` - Access distributed tracer

### Metrics

- `metrics.snapshot()` - Get current metrics snapshot
- `metrics.to_prometheus()` - Export Prometheus format
- `metrics.task_spawned()` - Record task spawn
- `metrics.task_completed(duration)` - Record completion
- `metrics.increment_counter(name, value)` - Custom counter
- `metrics.set_gauge(name, value)` - Custom gauge

### Health Checks

- `health.is_ready()` - Check readiness
- `health.is_alive()` - Check liveness
- `health.get_report()` - Get detailed report
- `health.add_check(name, status, message)` - Add custom check
- `health.heartbeat()` - Update heartbeat

### Tracing

- `TraceContext::new(service)` - Create trace context
- `context.child_span(operation)` - Create child span
- `span.set_attribute(key, value)` - Set span attribute
- `span.add_event(name)` - Add event to span
- `span.end()` - Complete span
- `tracer.to_jaeger_json()` - Export Jaeger format

## Examples

Run examples with:

```bash
cargo run --example industry40_metrics
cargo run --example industry40_tracing
cargo run --example industry40_health
cargo run --example industry40_autoscale
```

## Industry 4.0 Compliance

Avila Async is designed for modern Industry 4.0 applications:

- **Smart Manufacturing**: Real-time monitoring and adaptive scaling
- **IoT Integration**: Handle thousands of concurrent device connections
- **Predictive Maintenance**: Metrics for anomaly detection
- **Digital Twin**: Distributed tracing for system modeling
- **Edge Computing**: Lightweight with zero dependencies
- **Cloud Native**: Health checks for Kubernetes/Docker orchestration

## Performance Characteristics

- **Low Latency**: Optimized task scheduling
- **High Throughput**: Work-stealing thread pool
- **Memory Efficient**: Minimal overhead per task
- **CPU Efficient**: Adaptive thread scaling
- **Observable**: Real-time metrics without overhead

## Use Cases

- **Microservices**: Health checks, metrics, and tracing
- **Real-time Systems**: Low-latency task execution
- **Data Processing**: High-throughput batch operations
- **Web Servers**: Concurrent request handling
- **IoT Gateways**: Device connection management
- **Monitoring Systems**: Self-monitoring runtime

## Comparison with Other Runtimes

| Feature | Avila Async 0.3 | Tokio | async-std |
|---------|----------------|-------|-----------|
| Metrics | ✅ Built-in | ❌ External | ❌ External |
| Tracing | ✅ Built-in | 🟡 Via crate | ❌ No |
| Health Checks | ✅ Built-in | ❌ Manual | ❌ Manual |
| Auto-scaling | ✅ Built-in | ❌ No | ❌ No |
| Dependencies | 0 | Many | Some |
| Industry 4.0 | ✅ Yes | ❌ No | ❌ No |

## Roadmap

- [x] Real-time metrics collection
- [x] Distributed tracing
- [x] Health monitoring
- [x] Auto-scaling thread pool
- [x] Resource limits
- [ ] Metrics aggregation & alerts
- [ ] OpenTelemetry export
- [ ] Grafana dashboard templates
- [ ] Rate limiting
- [ ] Circuit breakers
- [ ] Advanced I/O (epoll/kqueue/IOCP)
- [ ] WebAssembly support

## Contributing

Contributions are welcome! This is an enterprise-grade runtime designed for Industry 4.0 applications.

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

## Author

Nícolas Ávila <nicolas@avila.inc>

---

**Made for Industry 4.0** 🏭 | **Enterprise Ready** 🚀 | **Zero Dependencies** 📦
