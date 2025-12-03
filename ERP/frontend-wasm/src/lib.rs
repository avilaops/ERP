use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{window, Document};

mod api;
mod models;
mod components;
mod pages;

use pages::{Dashboard, Clientes, Produtos, Vendas};

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"🚀 Avila ERP Frontend iniciado!".into());

    // Inicializar aplicação
    if let Err(e) = init_app() {
        web_sys::console::error_1(&format!("Erro ao inicializar: {:?}", e).into());
    }
}

fn init_app() -> Result<(), JsValue> {
    let window = window().ok_or("No window")?;
    let document = window.document().ok_or("No document")?;

    // Setup tabs
    setup_tabs(&document)?;

    // Carregar página inicial (Dashboard)
    load_dashboard()?;

    Ok(())
}

fn setup_tabs(document: &Document) -> Result<(), JsValue> {
    let tabs = vec!["dashboard", "vendas", "produtos", "clientes"];

    for tab_name in tabs {
        let btn = document
            .get_element_by_id(&format!("tab-{}", tab_name))
            .ok_or("Tab button not found")?;

        let tab_name_clone = tab_name.to_string();
        let closure = Closure::wrap(Box::new(move |_: web_sys::Event| {
            if let Err(e) = switch_tab(&tab_name_clone) {
                web_sys::console::error_1(&format!("Erro ao trocar tab: {:?}", e).into());
            }
        }) as Box<dyn FnMut(_)>);

        btn.add_event_listener_with_callback("click", closure.as_ref().unchecked_ref())?;
        closure.forget();
    }

    Ok(())
}

fn switch_tab(tab_name: &str) -> Result<(), JsValue> {
    // Usar JavaScript diretamente para manipular classes
    let window = web_sys::window().unwrap();
    let js = js_sys::Function::new_no_args(&format!(
        r#"
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-{}').classList.add('active');
        document.getElementById('{}').classList.add('active');
        "#,
        tab_name, tab_name
    ));
    js.call0(&window).ok();

    // Carregar dados da página
    match tab_name {
        "dashboard" => load_dashboard()?,
        "clientes" => load_clientes()?,
        "produtos" => load_produtos()?,
        "vendas" => load_vendas()?,
        _ => {}
    }

    Ok(())
}

fn load_dashboard() -> Result<(), JsValue> {
    wasm_bindgen_futures::spawn_local(async {
        if let Err(e) = Dashboard::load().await {
            web_sys::console::error_1(&format!("Erro no dashboard: {:?}", e).into());
        }
    });
    Ok(())
}

fn load_clientes() -> Result<(), JsValue> {
    wasm_bindgen_futures::spawn_local(async {
        if let Err(e) = Clientes::load().await {
            web_sys::console::error_1(&format!("Erro em clientes: {:?}", e).into());
        }
    });
    Ok(())
}

fn load_produtos() -> Result<(), JsValue> {
    wasm_bindgen_futures::spawn_local(async {
        if let Err(e) = Produtos::load().await {
            web_sys::console::error_1(&format!("Erro em produtos: {:?}", e).into());
        }
    });
    Ok(())
}

fn load_vendas() -> Result<(), JsValue> {
    wasm_bindgen_futures::spawn_local(async {
        if let Err(e) = Vendas::load().await {
            web_sys::console::error_1(&format!("Erro em vendas: {:?}", e).into());
        }
    });
    Ok(())
}
