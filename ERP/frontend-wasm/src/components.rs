use wasm_bindgen::JsCast;
use web_sys::{window, Element};

pub fn format_currency(value: f64) -> String {
    format!("R$ {:.2}", value).replace('.', ",")
}

pub fn format_date(date_str: &str) -> String {
    // Simplificado - pode melhorar depois
    if let Some(pos) = date_str.find('T') {
        date_str[..pos].to_string()
    } else {
        date_str.to_string()
    }
}

pub fn show_loading(show: bool) {
    if let Some(window) = window() {
        if let Some(document) = window.document() {
            if let Some(loading) = document.get_element_by_id("loading") {
                if show {
                    loading.set_attribute("style", "display: block;").ok();
                } else {
                    loading.set_attribute("style", "display: none;").ok();
                }
            }
        }
    }
}

pub fn show_alert(message: &str, alert_type: &str) {
    if let Some(window) = window() {
        if let Some(document) = window.document() {
            if let Some(container) = document.get_element_by_id("alert-container") {
                let class = match alert_type {
                    "success" => "alert-success",
                    "error" => "alert-danger",
                    _ => "alert-success",
                };

                container.set_inner_html(&format!(
                    r#"<div class="alert {}">{}</div>"#,
                    class, message
                ));

                // Remover após 3 segundos
                let container_clone = container.clone();
                let closure = wasm_bindgen::closure::Closure::wrap(Box::new(move || {
                    container_clone.set_inner_html("");
                }) as Box<dyn FnMut()>);

                window.set_timeout_with_callback_and_timeout_and_arguments_0(
                    closure.as_ref().unchecked_ref(),
                    3000
                ).ok();
                closure.forget();
            }
        }
    }
}

pub fn get_element_by_id(id: &str) -> Option<Element> {
    window()?
        .document()?
        .get_element_by_id(id)
}

pub fn set_inner_html(id: &str, html: &str) {
    if let Some(element) = get_element_by_id(id) {
        element.set_inner_html(html);
    }
}
