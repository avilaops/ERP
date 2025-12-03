/// Manipulação direta do DOM - Avila Framework
use web_sys::Element;

pub fn get_element_by_id(id: &str) -> Option<Element> {
    crate::core::document().get_element_by_id(id)
}

pub fn query_selector(selector: &str) -> Option<Element> {
    crate::core::document()
        .query_selector(selector)
        .ok()
        .flatten()
}

pub fn create_element(tag: &str) -> Element {
    crate::core::document()
        .create_element(tag)
        .expect("Falha ao criar elemento")
}

pub fn set_inner_html(element: &Element, html: &str) {
    element.set_inner_html(html);
}
