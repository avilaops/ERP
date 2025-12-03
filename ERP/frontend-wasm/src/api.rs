use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};
use serde::de::DeserializeOwned;

const API_BASE: &str = "http://localhost:3000/api/v1";

pub async fn fetch_json<T: DeserializeOwned>(path: &str) -> Result<T, JsValue> {
    let url = format!("{}{}", API_BASE, path);

    let opts = RequestInit::new();
    opts.set_method("GET");
    opts.set_mode(RequestMode::Cors);

    let request = Request::new_with_str_and_init(&url, &opts)?;
    request.headers().set("Accept", "application/json")?;    let window = web_sys::window().unwrap();
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;
    let resp: Response = resp_value.dyn_into()?;

    let json = JsFuture::from(resp.json()?).await?;

    let data: T = serde_wasm_bindgen::from_value(json)?;
    Ok(data)
}

pub async fn post_json<T: DeserializeOwned>(path: &str, body: &str) -> Result<T, JsValue> {
    let url = format!("{}{}", API_BASE, path);

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_mode(RequestMode::Cors);
    opts.set_body(&JsValue::from_str(body));

    let request = Request::new_with_str_and_init(&url, &opts)?;
    request.headers().set("Content-Type", "application/json")?;
    request.headers().set("Accept", "application/json")?;    let window = web_sys::window().unwrap();
    let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;
    let resp: Response = resp_value.dyn_into()?;

    let json = JsFuture::from(resp.json()?).await?;

    let data: T = serde_wasm_bindgen::from_value(json)?;
    Ok(data)
}

pub async fn delete(path: &str) -> Result<(), JsValue> {
    let url = format!("{}{}", API_BASE, path);

    let opts = RequestInit::new();
    opts.set_method("DELETE");
    opts.set_mode(RequestMode::Cors);

    let request = Request::new_with_str_and_init(&url, &opts)?;    let window = web_sys::window().unwrap();
    JsFuture::from(window.fetch_with_request(&request)).await?;

    Ok(())
}
