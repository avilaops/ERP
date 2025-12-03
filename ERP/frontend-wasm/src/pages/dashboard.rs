use wasm_bindgen::prelude::*;
use crate::{api, models::DashboardData, components};

pub struct Dashboard;

impl Dashboard {
    pub async fn load() -> Result<(), JsValue> {
        components::show_loading(true);

        let data: DashboardData = api::fetch_json("/dashboard").await?;

        Self::render(&data)?;

        components::show_loading(false);
        Ok(())
    }

    fn render(data: &DashboardData) -> Result<(), JsValue> {
        // Cards principais
        components::set_inner_html("vendasHojeQtd", &data.vendas_hoje.quantidade.to_string());
        components::set_inner_html("vendasHojeValor", &components::format_currency(data.vendas_hoje.valor_total));

        components::set_inner_html("vendasMesQtd", &data.resumo_mes.total_vendas.to_string());
        components::set_inner_html("vendasMesValor", &components::format_currency(data.resumo_mes.valor_total));

        components::set_inner_html("ticketMedio", &components::format_currency(data.resumo_mes.ticket_medio));
        components::set_inner_html("produtosCriticos", &data.estoque_critico.len().to_string());

        // Produtos mais vendidos
        let mut html = String::new();
        if data.produtos_mais_vendidos.is_empty() {
            html.push_str(r#"<tr><td colspan="3" style="text-align: center;">Nenhum produto vendido</td></tr>"#);
        } else {
            for p in &data.produtos_mais_vendidos {
                html.push_str(&format!(
                    r#"<tr>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                    </tr>"#,
                    p.produto_nome,
                    p.total_vendido,
                    components::format_currency(p.valor_total)
                ));
            }
        }
        components::set_inner_html("produtosMaisVendidos", &html);

        // Estoque crítico
        let mut html = String::new();
        if data.estoque_critico.is_empty() {
            html.push_str(r#"<tr><td colspan="4" style="text-align: center;">✅ Todos os produtos com estoque adequado</td></tr>"#);
        } else {
            for p in &data.estoque_critico {
                html.push_str(&format!(
                    r#"<tr>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td><span class="badge badge-danger">Crítico</span></td>
                    </tr>"#,
                    p.nome,
                    p.estoque_atual,
                    p.estoque_minimo
                ));
            }
        }
        components::set_inner_html("estoqueCriticoTable", &html);

        Ok(())
    }
}
