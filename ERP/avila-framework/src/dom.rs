//! DOM manipulation with mathematical precision

use crate::{String, Vec, format};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use web_sys::{Document, Element, HtmlElement};

/// DOM builder with fluent API
pub struct DomBuilder {
    tag: String,
    attributes: Vec<(String, String)>,
    children: Vec<DomBuilder>,
    text: Option<String>,
}

impl DomBuilder {
    pub fn new(tag: &str) -> Self {
        use alloc::string::ToString;
        Self {
            tag: tag.to_string(),
            attributes: Vec::new(),
            children: Vec::new(),
            text: None,
        }
    }

    pub fn attr(mut self, key: &str, value: &str) -> Self {
        use alloc::string::ToString;
        self.attributes.push((key.to_string(), value.to_string()));
        self
    }

    pub fn child(mut self, child: DomBuilder) -> Self {
        self.children.push(child);
        self
    }

    pub fn text(mut self, text: &str) -> Self {
        use alloc::string::ToString;
        self.text = Some(text.to_string());
        self
    }

    pub fn to_html(&self) -> String {
        let mut html = format!("<{}", self.tag);

        for (key, value) in &self.attributes {
            html.push_str(&format!(r#" {}="{}""#, key, value));
        }

        html.push('>');

        if let Some(ref text) = self.text {
            html.push_str(text);
        }

        for child in &self.children {
            html.push_str(&child.to_html());
        }

        html.push_str(&format!("</{}>", self.tag));
        html
    }

    #[cfg(target_arch = "wasm32")]
    pub fn build(&self, document: &Document) -> Result<Element, String> {
        let element = document
            .create_element(&self.tag)
            .map_err(|_| "Failed to create element")?;

        for (key, value) in &self.attributes {
            element
                .set_attribute(key, value)
                .map_err(|_| "Failed to set attribute")?;
        }

        if let Some(ref text) = self.text {
            element.set_text_content(Some(text));
        }

        for child in &self.children {
            let child_element = child.build(document)?;
            element
                .append_child(&child_element)
                .map_err(|_| "Failed to append child")?;
        }

        Ok(element)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_element() {
        let div = DomBuilder::new("div")
            .attr("class", "container")
            .text("Hello");

        assert_eq!(div.to_html(), r#"<div class="container">Hello</div>"#);
    }

    #[test]
    fn test_nested_elements() {
        let div = DomBuilder::new("div")
            .child(
                DomBuilder::new("span")
                    .text("Nested")
            );

        assert_eq!(div.to_html(), "<div><span>Nested</span></div>");
    }
}
