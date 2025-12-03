/// Sistema de roteamento SPA do Avila Framework
use std::collections::HashMap;
use crate::core::VirtualNode;

pub struct Router {
    routes: HashMap<String, Box<dyn Fn() -> VirtualNode>>,
    current_route: String,
}

impl Router {
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
            current_route: "/".to_string(),
        }
    }

    pub fn route<F>(mut self, path: &str, handler: F) -> Self
    where
        F: Fn() -> VirtualNode + 'static,
    {
        self.routes.insert(path.to_string(), Box::new(handler));
        self
    }

    pub fn render(&self) -> VirtualNode {
        if let Some(handler) = self.routes.get(&self.current_route) {
            handler()
        } else {
            VirtualNode::new("div")
                .child(VirtualNode::text("404 - Página não encontrada"))
        }
    }

    pub fn navigate(&mut self, path: &str) {
        self.current_route = path.to_string();
    }
}
