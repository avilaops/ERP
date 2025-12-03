//! # avila-grpc
extern crate alloc;
use alloc::string::String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusCode { Ok = 0, NotFound = 5, Internal = 13 }

pub struct Request<T> {
    pub message: T,
}

impl<T> Request<T> {
    pub fn new(message: T) -> Self { Self { message } }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_request() { let r = Request::new(42u32); assert_eq!(r.message, 42); }
}
