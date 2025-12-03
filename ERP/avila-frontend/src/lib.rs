use wasm_bindgen::prelude::*;

pub mod core;
pub mod components;
pub mod router;
pub mod state;
pub mod dom;
pub mod events;

pub use core::*;
pub use components::*;
pub use router::*;
pub use state::*;

/// Inicializa o Avila Framework
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"🚀 Avila Framework iniciado!".into());
}

/// Ponto de entrada da aplicação
#[wasm_bindgen]
pub fn render_app() {
    let app = App::new();
    app.mount("root");
}
