//! # avila-tracing - Distributed Tracing
extern crate alloc;
use alloc::string::String;
use alloc::vec::Vec;

/// Trace span
#[derive(Clone, Debug)]
pub struct Span {
    pub trace_id: u64,
    pub span_id: u64,
    pub parent_id: Option<u64>,
    pub name: String,
    pub start: u64,
    pub duration: u64,
}

impl Span {
    pub fn new(trace_id: u64, span_id: u64, name: String) -> Self {
        Self {
            trace_id,
            span_id,
            parent_id: None,
            name,
            start: 0,
            duration: 0,
        }
    }
}

/// Tracer
pub struct Tracer {
    pub spans: Vec<Span>,
}

impl Tracer {
    pub fn new() -> Self {
        Self { spans: Vec::new() }
    }
    
    pub fn start_span(&mut self, span: Span) {
        self.spans.push(span);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_span() {
        let span = Span::new(1, 1, "test".into());
        assert_eq!(span.trace_id, 1);
    }
    
    #[test]
    fn test_tracer() {
        let mut tracer = Tracer::new();
        tracer.start_span(Span::new(1, 1, "op1".into()));
        assert_eq!(tracer.spans.len(), 1);
    }
}
