use wasm_bindgen::prelude::*;
use crate::{api, models::Venda, components};

pub struct Vendas;

impl Vendas {
    pub async fn load() -> Result<(), JsValue> {
        components::show_loading(true);

        let vendas: Vec<Venda> = api::fetch_json("/vendas").await?;

        Self::render(&vendas)?;

        components::show_loading(false);
        Ok(())
    }

    fn render(vendas: &[Venda]) -> Result<(), JsValue> {
        let mut html = String::new();

        if vendas.is_empty() {
            html.push_str(r#"<tr><td colspan="6" style="text-align: center;">Nenhuma venda registrada</td></tr>"#);
        } else {
            for v in vendas {
                let badge = match v.status.as_str() {
                    "FINALIZADA" => r#"<span class="badge badge-success">Finalizada</span>"#,
                    "ABERTA" => r#"<span class="badge badge-warning">Aberta</span>"#,
                    "CANCELADA" => r#"<span class="badge badge-danger">Cancelada</span>"#,
                    _ => "",
                };

                html.push_str(&format!(
                    r#"<tr>
                        <td>#{}</td>
                        <td>-</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>
                            <button class="btn btn-primary" onclick="verVenda({})">Ver</button>
                        </td>
                    </tr>"#,
                    v.id,
                    v.cliente_id.map(|id| format!("Cliente #{}", id)).unwrap_or("-".to_string()),
                    components::format_currency(v.total_final),
                    badge,
                    v.id
                ));
            }
        }

        components::set_inner_html("vendasTable", &html);

        Ok(())
    }
}
