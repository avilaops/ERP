/// Sistema de eventos do Avila Framework
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Event, EventTarget, MouseEvent};

pub struct EventHandler;

impl EventHandler {
    pub fn on_click<F>(target: &EventTarget, callback: F)
    where
        F: Fn(MouseEvent) + 'static,
    {
        let closure = Closure::wrap(Box::new(move |event: Event| {
            if let Some(mouse_event) = event.dyn_ref::<MouseEvent>() {
                callback(mouse_event.clone());
            }
        }) as Box<dyn Fn(Event)>);

        target
            .add_event_listener_with_callback("click", closure.as_ref().unchecked_ref())
            .ok();

        closure.forget();
    }

    pub fn on_input<F>(target: &EventTarget, callback: F)
    where
        F: Fn(String) + 'static,
    {
        let closure = Closure::wrap(Box::new(move |event: Event| {
            if let Some(input) = event
                .target()
                .and_then(|t| t.dyn_into::<web_sys::HtmlInputElement>().ok())
            {
                callback(input.value());
            }
        }) as Box<dyn Fn(Event)>);

        target
            .add_event_listener_with_callback("input", closure.as_ref().unchecked_ref())
            .ok();

        closure.forget();
    }

    pub fn on_change<F>(target: &EventTarget, callback: F)
    where
        F: Fn(String) + 'static,
    {
        let closure = Closure::wrap(Box::new(move |event: Event| {
            if let Some(input) = event
                .target()
                .and_then(|t| t.dyn_into::<web_sys::HtmlInputElement>().ok())
            {
                callback(input.value());
            }
        }) as Box<dyn Fn(Event)>);

        target
            .add_event_listener_with_callback("change", closure.as_ref().unchecked_ref())
            .ok();

        closure.forget();
    }
}
