//! Distributed tracing support for Industry 4.0
//!
//! Provides context propagation and span tracking across async boundaries

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use std::collections::HashMap;

static TRACE_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
static SPAN_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Trace context for distributed tracing
#[derive(Clone, Debug)]
pub struct TraceContext {
    pub trace_id: u64,
    pub span_id: u64,
    pub parent_span_id: Option<u64>,
    pub service_name: String,
    pub attributes: HashMap<String, String>,
}

impl TraceContext {
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            trace_id: TRACE_ID_COUNTER.fetch_add(1, Ordering::Relaxed),
            span_id: SPAN_ID_COUNTER.fetch_add(1, Ordering::Relaxed),
            parent_span_id: None,
            service_name: service_name.into(),
            attributes: HashMap::new(),
        }
    }

    pub fn child_span(&self, operation: impl Into<String>) -> Span {
        let span_id = SPAN_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        Span {
            trace_id: self.trace_id,
            span_id,
            parent_span_id: Some(self.span_id),
            operation: operation.into(),
            start_time: Instant::now(),
            end_time: None,
            attributes: HashMap::new(),
            events: Vec::new(),
        }
    }

    pub fn set_attribute(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.attributes.insert(key.into(), value.into());
    }
}

/// A span representing a unit of work
#[derive(Debug)]
pub struct Span {
    pub trace_id: u64,
    pub span_id: u64,
    pub parent_span_id: Option<u64>,
    pub operation: String,
    pub start_time: Instant,
    pub end_time: Option<Instant>,
    pub attributes: HashMap<String, String>,
    pub events: Vec<SpanEvent>,
}

#[derive(Debug, Clone)]
pub struct SpanEvent {
    pub name: String,
    pub timestamp: Instant,
    pub attributes: HashMap<String, String>,
}

impl Span {
    pub fn set_attribute(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.attributes.insert(key.into(), value.into());
    }

    pub fn add_event(&mut self, name: impl Into<String>) {
        self.events.push(SpanEvent {
            name: name.into(),
            timestamp: Instant::now(),
            attributes: HashMap::new(),
        });
    }

    pub fn add_event_with_attributes(
        &mut self,
        name: impl Into<String>,
        attributes: HashMap<String, String>,
    ) {
        self.events.push(SpanEvent {
            name: name.into(),
            timestamp: Instant::now(),
            attributes,
        });
    }

    pub fn end(mut self) -> CompletedSpan {
        self.end_time = Some(Instant::now());
        CompletedSpan {
            trace_id: self.trace_id,
            span_id: self.span_id,
            parent_span_id: self.parent_span_id,
            operation: self.operation,
            duration: self.end_time.unwrap() - self.start_time,
            attributes: self.attributes,
            events: self.events,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CompletedSpan {
    pub trace_id: u64,
    pub span_id: u64,
    pub parent_span_id: Option<u64>,
    pub operation: String,
    pub duration: std::time::Duration,
    pub attributes: HashMap<String, String>,
    pub events: Vec<SpanEvent>,
}

impl std::fmt::Display for CompletedSpan {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Span[trace={:016x} span={:016x} parent={:?}] {} {:?}",
            self.trace_id, self.span_id, self.parent_span_id, self.operation, self.duration
        )
    }
}

/// Tracer for collecting spans
pub struct Tracer {
    spans: Arc<std::sync::Mutex<Vec<CompletedSpan>>>,
}

impl Tracer {
    pub fn new() -> Self {
        Self {
            spans: Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    pub fn record(&self, span: CompletedSpan) {
        let mut spans = self.spans.lock().unwrap();
        spans.push(span);
    }

    pub fn get_spans(&self) -> Vec<CompletedSpan> {
        let spans = self.spans.lock().unwrap();
        spans.clone()
    }

    pub fn clear(&self) {
        let mut spans = self.spans.lock().unwrap();
        spans.clear();
    }

    /// Export spans in Jaeger format
    pub fn to_jaeger_json(&self) -> String {
        let spans = self.get_spans();
        let mut json = String::from("[\n");

        for (i, span) in spans.iter().enumerate() {
            if i > 0 {
                json.push_str(",\n");
            }
            json.push_str(&format!(
                "  {{\n    \"traceId\": \"{:016x}\",\n    \"spanId\": \"{:016x}\",\n    \
                 \"operationName\": \"{}\",\n    \"duration\": {},\n    \
                 \"startTime\": 0\n  }}",
                span.trace_id,
                span.span_id,
                span.operation,
                span.duration.as_micros()
            ));
        }

        json.push_str("\n]");
        json
    }
}

impl Default for Tracer {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for Tracer {
    fn clone(&self) -> Self {
        Self {
            spans: Arc::clone(&self.spans),
        }
    }
}
