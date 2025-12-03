//! Router for client-side navigation
//!
//! This module provides URL routing, parameter extraction, and history
//! management for single-page applications.
//!
//! # Features
//! - Route matching with parameters
//! - Query string parsing
//! - History API integration
//! - Route guards
//! - Nested routes

use crate::{String, Vec, format};
use alloc::boxed::Box;
use core::fmt;

/// Route parameter extracted from URL
#[derive(Debug, Clone, PartialEq)]
pub struct RouteParam {
    pub key: String,
    pub value: String,
}

/// Query parameter from URL query string
#[derive(Debug, Clone, PartialEq)]
pub struct QueryParam {
    pub key: String,
    pub value: String,
}

/// Parsed route match
#[derive(Debug, Clone)]
pub struct RouteMatch {
    pub path: String,
    pub params: Vec<RouteParam>,
    pub query: Vec<QueryParam>,
}

impl RouteMatch {
    /// Get parameter value by key
    pub fn param(&self, key: &str) -> Option<&str> {
        self.params
            .iter()
            .find(|p| p.key == key)
            .map(|p| p.value.as_str())
    }

    /// Get query parameter value by key
    pub fn query(&self, key: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|q| q.key == key)
            .map(|q| q.value.as_str())
    }
}

/// Route pattern segment
#[derive(Debug, Clone, PartialEq)]
enum Segment {
    /// Static segment (e.g., "users")
    Static(String),
    /// Parameter segment (e.g., ":id")
    Param(String),
    /// Wildcard segment (e.g., "*path")
    Wildcard(String),
}

/// Route definition
#[derive(Debug, Clone)]
pub struct Route {
    pattern: String,
    segments: Vec<Segment>,
}

impl Route {
    /// Create new route from pattern
    ///
    /// Patterns support:
    /// - Static segments: "/users/list"
    /// - Parameters: "/users/:id"
    /// - Wildcards: "/files/*path"
    pub fn new(pattern: &str) -> Self {
        let segments = Self::parse_pattern(pattern);
        Self {
            pattern: pattern.into(),
            segments,
        }
    }

    /// Parse route pattern into segments
    fn parse_pattern(pattern: &str) -> Vec<Segment> {
        pattern
            .trim_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .map(|s| {
                if s.starts_with(':') {
                    Segment::Param(s[1..].into())
                } else if s.starts_with('*') {
                    Segment::Wildcard(s[1..].into())
                } else {
                    Segment::Static(s.into())
                }
            })
            .collect()
    }

    /// Match route against path
    pub fn matches(&self, path: &str) -> Option<RouteMatch> {
        let path = path.trim_matches('/');
        let parts: Vec<&str> = path.split('?').collect();
        let path_part = parts[0];
        let query_part = parts.get(1).unwrap_or(&"");

        let path_segments: Vec<&str> = path_part
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        // Check if segment counts match (unless wildcard)
        let has_wildcard = self.segments.iter().any(|s| matches!(s, Segment::Wildcard(_)));
        if !has_wildcard && path_segments.len() != self.segments.len() {
            return None;
        }

        let mut params = Vec::new();

        // Match segments
        for (i, segment) in self.segments.iter().enumerate() {
            match segment {
                Segment::Static(expected) => {
                    if path_segments.get(i) != Some(&expected.as_str()) {
                        return None;
                    }
                }
                Segment::Param(name) => {
                    if let Some(&value) = path_segments.get(i) {
                        params.push(RouteParam {
                            key: name.clone(),
                            value: value.into(),
                        });
                    } else {
                        return None;
                    }
                }
                Segment::Wildcard(name) => {
                    // Wildcard captures remaining segments
                    let remaining: Vec<&str> = path_segments.iter().skip(i).copied().collect();
                    params.push(RouteParam {
                        key: name.clone(),
                        value: remaining.join("/"),
                    });
                    break;
                }
            }
        }

        // Parse query string
        let query = Self::parse_query(query_part);

        Some(RouteMatch {
            path: path_part.into(),
            params,
            query,
        })
    }

    /// Parse query string into parameters
    fn parse_query(query: &str) -> Vec<QueryParam> {
        if query.is_empty() {
            return Vec::new();
        }

        query
            .split('&')
            .filter_map(|pair| {
                let parts: Vec<&str> = pair.split('=').collect();
                if parts.len() == 2 {
                    Some(QueryParam {
                        key: parts[0].into(),
                        value: parts[1].into(),
                    })
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn pattern(&self) -> &str {
        &self.pattern
    }
}

/// Route guard for access control
pub type RouteGuard = Box<dyn Fn(&RouteMatch) -> bool>;

/// Router configuration
pub struct Router {
    routes: Vec<(Route, RouteGuard)>,
    current: Option<RouteMatch>,
}

impl Router {
    /// Create new router
    pub fn new() -> Self {
        Self {
            routes: Vec::new(),
            current: None,
        }
    }

    /// Add route with guard
    pub fn add_route(&mut self, pattern: &str, guard: RouteGuard) {
        let route = Route::new(pattern);
        self.routes.push((route, guard));
    }

    /// Add route without guard (always allows)
    pub fn add(&mut self, pattern: &str) {
        self.add_route(pattern, Box::new(|_| true));
    }

    /// Navigate to path
    pub fn navigate(&mut self, path: &str) -> Option<RouteMatch> {
        for (route, guard) in &self.routes {
            if let Some(route_match) = route.matches(path) {
                if guard(&route_match) {
                    self.current = Some(route_match.clone());
                    return Some(route_match);
                }
            }
        }
        None
    }

    /// Get current route match
    pub fn current(&self) -> Option<&RouteMatch> {
        self.current.as_ref()
    }

    /// Check if path matches any route
    pub fn can_navigate(&self, path: &str) -> bool {
        for (route, guard) in &self.routes {
            if let Some(route_match) = route.matches(path) {
                if guard(&route_match) {
                    return true;
                }
            }
        }
        false
    }
}

impl Default for Router {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for Router {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Router")
            .field("routes_count", &self.routes.len())
            .field("current", &self.current)
            .finish()
    }
}

/// History entry for navigation
#[derive(Debug, Clone)]
pub struct HistoryEntry {
    pub path: String,
    pub state: Option<String>,
}

/// History manager for browser-like navigation
pub struct History {
    entries: Vec<HistoryEntry>,
    current_index: usize,
}

impl History {
    /// Create new history
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            current_index: 0,
        }
    }

    /// Push new entry
    pub fn push(&mut self, path: String, state: Option<String>) {
        // Remove forward history when pushing new entry
        self.entries.truncate(self.current_index + 1);

        self.entries.push(HistoryEntry { path, state });
        self.current_index = self.entries.len() - 1;
    }

    /// Go back in history
    pub fn back(&mut self) -> Option<&HistoryEntry> {
        if self.current_index > 0 {
            self.current_index -= 1;
            self.entries.get(self.current_index)
        } else {
            None
        }
    }

    /// Go forward in history
    pub fn forward(&mut self) -> Option<&HistoryEntry> {
        if self.current_index < self.entries.len() - 1 {
            self.current_index += 1;
            self.entries.get(self.current_index)
        } else {
            None
        }
    }

    /// Get current entry
    pub fn current(&self) -> Option<&HistoryEntry> {
        self.entries.get(self.current_index)
    }

    /// Check if can go back
    pub fn can_go_back(&self) -> bool {
        self.current_index > 0
    }

    /// Check if can go forward
    pub fn can_go_forward(&self) -> bool {
        self.current_index < self.entries.len() - 1
    }

    /// Get history length
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if history is empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_route_static() {
        let route = Route::new("/users");
        assert!(route.matches("/users").is_some());
        assert!(route.matches("/posts").is_none());
    }

    #[test]
    fn test_route_param() {
        let route = Route::new("/users/:id");
        let route_match = route.matches("/users/123").unwrap();

        assert_eq!(route_match.param("id"), Some("123"));
    }

    #[test]
    fn test_route_multiple_params() {
        let route = Route::new("/users/:userId/posts/:postId");
        let route_match = route.matches("/users/42/posts/99").unwrap();

        assert_eq!(route_match.param("userId"), Some("42"));
        assert_eq!(route_match.param("postId"), Some("99"));
    }

    #[test]
    fn test_route_wildcard() {
        let route = Route::new("/files/*path");
        let route_match = route.matches("/files/docs/readme.md").unwrap();

        assert_eq!(route_match.param("path"), Some("docs/readme.md"));
    }

    #[test]
    fn test_route_query_params() {
        let route = Route::new("/search");
        let route_match = route.matches("/search?q=rust&page=2").unwrap();

        assert_eq!(route_match.query("q"), Some("rust"));
        assert_eq!(route_match.query("page"), Some("2"));
    }

    #[test]
    fn test_route_no_match() {
        let route = Route::new("/users/:id");
        assert!(route.matches("/posts/123").is_none());
    }

    #[test]
    fn test_router_add_route() {
        let mut router = Router::new();
        router.add("/users");
        router.add("/posts");

        assert!(router.can_navigate("/users"));
        assert!(router.can_navigate("/posts"));
        assert!(!router.can_navigate("/comments"));
    }

    #[test]
    fn test_router_navigate() {
        let mut router = Router::new();
        router.add("/users/:id");

        let route_match = router.navigate("/users/123").unwrap();
        assert_eq!(route_match.param("id"), Some("123"));

        assert_eq!(router.current().unwrap().param("id"), Some("123"));
    }

    #[test]
    fn test_router_guard() {
        let mut router = Router::new();

        // Add route with guard that only allows even IDs
        router.add_route("/users/:id", Box::new(|m| {
            if let Some(id) = m.param("id") {
                id.parse::<i32>().map(|n| n % 2 == 0).unwrap_or(false)
            } else {
                false
            }
        }));

        assert!(router.navigate("/users/2").is_some());
        assert!(router.navigate("/users/3").is_none());
    }

    #[test]
    fn test_history_push() {
        let mut history = History::new();
        history.push("/home".into(), None);
        history.push("/about".into(), None);

        assert_eq!(history.len(), 2);
        assert_eq!(history.current().unwrap().path, "/about");
    }

    #[test]
    fn test_history_back() {
        let mut history = History::new();
        history.push("/home".into(), None);
        history.push("/about".into(), None);

        let entry = history.back().unwrap();
        assert_eq!(entry.path, "/home");
        assert_eq!(history.current().unwrap().path, "/home");
    }

    #[test]
    fn test_history_forward() {
        let mut history = History::new();
        history.push("/home".into(), None);
        history.push("/about".into(), None);
        history.back();

        let entry = history.forward().unwrap();
        assert_eq!(entry.path, "/about");
    }

    #[test]
    fn test_history_can_navigate() {
        let mut history = History::new();
        history.push("/home".into(), None);
        history.push("/about".into(), None);
        history.push("/contact".into(), None);

        // At /contact (index 2)
        assert!(history.can_go_back());
        assert!(!history.can_go_forward());

        // Go to /about (index 1)
        history.back();
        assert!(history.can_go_back());
        assert!(history.can_go_forward());

        // Go to /home (index 0)
        history.back();
        assert!(!history.can_go_back());
        assert!(history.can_go_forward());
    }

    #[test]
    fn test_history_truncate_forward() {
        let mut history = History::new();
        history.push("/home".into(), None);
        history.push("/about".into(), None);
        history.push("/contact".into(), None);
        history.back();
        history.back();

        // Push new entry - should remove forward history
        history.push("/new".into(), None);

        assert_eq!(history.len(), 2); // /home, /new
        assert!(!history.can_go_forward());
    }

    #[test]
    fn test_route_pattern_getter() {
        let route = Route::new("/users/:id");
        assert_eq!(route.pattern(), "/users/:id");
    }

    #[test]
    fn test_route_match_with_trailing_slash() {
        let route = Route::new("/users");
        assert!(route.matches("/users/").is_some());
    }

    #[test]
    fn test_query_params_empty() {
        let route = Route::new("/search");
        let route_match = route.matches("/search").unwrap();
        assert!(route_match.query.is_empty());
    }

    #[test]
    fn test_history_state() {
        let mut history = History::new();
        history.push("/home".into(), Some("home-state".into()));

        let entry = history.current().unwrap();
        assert_eq!(entry.state, Some("home-state".into()));
    }
}
