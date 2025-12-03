use web_sys::{Document, Window};

/// Core do framework - Virtual DOM e renderização
#[derive(Clone)]
pub struct VirtualNode {
    pub tag: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<VirtualNode>,
    pub text: Option<String>,
}

impl VirtualNode {
    pub fn new(tag: &str) -> Self {
        Self {
            tag: tag.to_string(),
            attrs: Vec::new(),
            children: Vec::new(),
            text: None,
        }
    }

    pub fn text(content: &str) -> Self {
        Self {
            tag: String::new(),
            attrs: Vec::new(),
            children: Vec::new(),
            text: Some(content.to_string()),
        }
    }

    pub fn attr(mut self, key: &str, value: &str) -> Self {
        self.attrs.push((key.to_string(), value.to_string()));
        self
    }

    pub fn class(self, class: &str) -> Self {
        self.attr("class", class)
    }

    pub fn id(self, id: &str) -> Self {
        self.attr("id", id)
    }

    pub fn child(mut self, node: VirtualNode) -> Self {
        self.children.push(node);
        self
    }

    pub fn children(mut self, nodes: Vec<VirtualNode>) -> Self {
        self.children.extend(nodes);
        self
    }

    /// Renderiza o Virtual DOM em um elemento real do navegador
    pub fn render(&self) -> web_sys::Node {
        let document = window().document().unwrap();

        if let Some(text) = &self.text {
            return document.create_text_node(text).into();
        }

        let element = document.create_element(&self.tag).unwrap();

        for (key, value) in &self.attrs {
            element.set_attribute(key, value).unwrap();
        }

        for child in &self.children {
            element.append_child(&child.render()).unwrap();
        }

        element.into()
    }
}

/// Obtém a janela do navegador
pub fn window() -> Window {
    web_sys::window().expect("Sem acesso ao window")
}

/// Obtém o documento
pub fn document() -> Document {
    window().document().expect("Sem acesso ao document")
}

/// Componente base do framework
pub trait Component {
    fn render(&self) -> VirtualNode;
    fn mount(&self, selector: &str) {
        let document = document();
        let container = document
            .get_element_by_id(selector)
            .expect(&format!("Elemento '{}' não encontrado", selector));

        let node = self.render().render();
        container.append_child(&node).unwrap();
    }
}

/// Aplicação principal
pub struct App;

impl App {
    pub fn new() -> Self {
        Self
    }
}

impl Component for App {
    fn render(&self) -> VirtualNode {
        VirtualNode::new("div")
            .class("avila-app")
            .child(
                VirtualNode::new("h1")
                    .class("title")
                    .child(VirtualNode::text("🚀 Avila Framework"))
            )
            .child(
                VirtualNode::new("p")
                    .child(VirtualNode::text("O melhor framework frontend 100% Rust da história!"))
            )
    }
}
