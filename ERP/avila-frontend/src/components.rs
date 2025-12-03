use crate::core::VirtualNode;

/// Sistema de componentes visuais do Avila Framework

/// Button Component
pub struct Button {
    pub text: String,
    pub variant: ButtonVariant,
    pub size: ButtonSize,
}

pub enum ButtonVariant {
    Primary,
    Secondary,
    Danger,
    Success,
}

pub enum ButtonSize {
    Small,
    Medium,
    Large,
}

impl Button {
    pub fn new(text: &str) -> Self {
        Self {
            text: text.to_string(),
            variant: ButtonVariant::Primary,
            size: ButtonSize::Medium,
        }
    }

    pub fn variant(mut self, variant: ButtonVariant) -> Self {
        self.variant = variant;
        self
    }

    pub fn size(mut self, size: ButtonSize) -> Self {
        self.size = size;
        self
    }

    pub fn render(&self) -> VirtualNode {
        let variant_class = match self.variant {
            ButtonVariant::Primary => "btn-primary",
            ButtonVariant::Secondary => "btn-secondary",
            ButtonVariant::Danger => "btn-danger",
            ButtonVariant::Success => "btn-success",
        };

        let size_class = match self.size {
            ButtonSize::Small => "btn-sm",
            ButtonSize::Medium => "btn-md",
            ButtonSize::Large => "btn-lg",
        };

        VirtualNode::new("button")
            .class(&format!("avila-btn {} {}", variant_class, size_class))
            .child(VirtualNode::text(&self.text))
    }
}

/// Card Component
pub struct Card {
    pub title: String,
    pub content: String,
    pub footer: Option<String>,
}

impl Card {
    pub fn new(title: &str, content: &str) -> Self {
        Self {
            title: title.to_string(),
            content: content.to_string(),
            footer: None,
        }
    }

    pub fn footer(mut self, footer: &str) -> Self {
        self.footer = Some(footer.to_string());
        self
    }

    pub fn render(&self) -> VirtualNode {
        let mut card = VirtualNode::new("div")
            .class("avila-card")
            .child(
                VirtualNode::new("div")
                    .class("card-header")
                    .child(VirtualNode::new("h3").child(VirtualNode::text(&self.title)))
            )
            .child(
                VirtualNode::new("div")
                    .class("card-body")
                    .child(VirtualNode::new("p").child(VirtualNode::text(&self.content)))
            );

        if let Some(footer) = &self.footer {
            card = card.child(
                VirtualNode::new("div")
                    .class("card-footer")
                    .child(VirtualNode::text(footer))
            );
        }

        card
    }
}

/// Input Component
pub struct Input {
    pub placeholder: String,
    pub input_type: String,
    pub value: String,
}

impl Input {
    pub fn new(placeholder: &str) -> Self {
        Self {
            placeholder: placeholder.to_string(),
            input_type: "text".to_string(),
            value: String::new(),
        }
    }

    pub fn input_type(mut self, t: &str) -> Self {
        self.input_type = t.to_string();
        self
    }

    pub fn render(&self) -> VirtualNode {
        VirtualNode::new("input")
            .class("avila-input")
            .attr("type", &self.input_type)
            .attr("placeholder", &self.placeholder)
            .attr("value", &self.value)
    }
}

/// Container/Layout Component
pub struct Container {
    pub children: Vec<VirtualNode>,
}

impl Container {
    pub fn new() -> Self {
        Self {
            children: Vec::new(),
        }
    }

    pub fn child(mut self, node: VirtualNode) -> Self {
        self.children.push(node);
        self
    }

    pub fn render(&self) -> VirtualNode {
        VirtualNode::new("div")
            .class("avila-container")
            .children(self.children.clone())
    }
}

/// Grid Component
pub struct Grid {
    pub columns: usize,
    pub children: Vec<VirtualNode>,
}

impl Grid {
    pub fn new(columns: usize) -> Self {
        Self {
            columns,
            children: Vec::new(),
        }
    }

    pub fn child(mut self, node: VirtualNode) -> Self {
        self.children.push(node);
        self
    }

    pub fn render(&self) -> VirtualNode {
        VirtualNode::new("div")
            .class(&format!("avila-grid grid-cols-{}", self.columns))
            .children(self.children.clone())
    }
}

/// Navbar Component
pub struct Navbar {
    pub brand: String,
    pub items: Vec<NavItem>,
}

pub struct NavItem {
    pub label: String,
    pub href: String,
}

impl Navbar {
    pub fn new(brand: &str) -> Self {
        Self {
            brand: brand.to_string(),
            items: Vec::new(),
        }
    }

    pub fn item(mut self, label: &str, href: &str) -> Self {
        self.items.push(NavItem {
            label: label.to_string(),
            href: href.to_string(),
        });
        self
    }

    pub fn render(&self) -> VirtualNode {
        let mut nav_items = Vec::new();
        for item in &self.items {
            nav_items.push(
                VirtualNode::new("a")
                    .class("nav-item")
                    .attr("href", &item.href)
                    .child(VirtualNode::text(&item.label))
            );
        }

        VirtualNode::new("nav")
            .class("avila-navbar")
            .child(
                VirtualNode::new("div")
                    .class("nav-brand")
                    .child(VirtualNode::text(&self.brand))
            )
            .child(
                VirtualNode::new("div")
                    .class("nav-items")
                    .children(nav_items)
            )
    }
}
