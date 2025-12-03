use wasm_bindgen::prelude::*;
use crate::{api, models::Produto, components};

pub struct Produtos;

impl Produtos {
    pub async fn load() -> Result<(), JsValue> {
        components::show_loading(true);

        let produtos: Vec<Produto> = api::fetch_json("/produtos").await?;

        Self::render(&produtos)?;

        components::show_loading(false);
        Ok(())
    }

    fn render(produtos: &[Produto]) -> Result<(), JsValue> {
        let mut html = String::new();

        if produtos.is_empty() {
            html.push_str(r#"<tr><td colspan="6" style="text-align: center;">Nenhum produto cadastrado</td></tr>"#);
        } else {
            for p in produtos {
                let badge = if p.estoque_atual <= p.estoque_minimo {
                    r#"<span class="badge badge-danger">Crítico</span>"#
                } else if p.estoque_atual <= p.estoque_minimo * 2 {
                    r#"<span class="badge badge-warning">Baixo</span>"#
                } else {
                    r#"<span class="badge badge-success">OK</span>"#
                };

                html.push_str(&format!(
                    r#"<tr>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>
                            <button class="btn btn-primary" onclick="movimentarEstoque({})">Movimentar</button>
                            <button class="btn btn-warning" onclick="editarProduto({})">Editar</button>
                        </td>
                    </tr>"#,
                    p.nome,
                    p.codigo_barras.as_deref().unwrap_or("-"),
                    components::format_currency(p.preco_venda),
                    p.estoque_atual,
                    badge,
                    p.id,
                    p.id
                ));
            }
        }

        components::set_inner_html("produtosTable", &html);

        Ok(())
    }
}
