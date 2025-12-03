//! Web utilities

/// HTTP request type
pub struct Request {
    pub method: String,
    pub path: String,
}

/// HTTP response type
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

impl Response {
    /// Create a new response
    pub fn new(status: u16, body: Vec<u8>) -> Self {
        Response { status, body }
    }

    /// Create OK response
    pub fn ok(body: Vec<u8>) -> Self {
        Response::new(200, body)
    }
}
