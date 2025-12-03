use wasm_bindgen::prelude::*;
use crate::{api, models::Cliente, components};

pub struct Clientes;

impl Clientes {
    pub async fn load() -> Result<(), JsValue> {
        components::show_loading(true);

        let clientes: Vec<Cliente> = api::fetch_json("/clientes").await?;

        Self::render(&clientes)?;

        components::show_loading(false);
        Ok(())
    }

    fn render(clientes: &[Cliente]) -> Result<(), JsValue> {
        let mut html = String::new();

        if clientes.is_empty() {
            html.push_str(r#"<tr><td colspan="6" style="text-align: center;">Nenhum cliente cadastrado</td></tr>"#);
        } else {
            for c in clientes {
                html.push_str(&format!(
                    r#"<tr>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>{}</td>
                        <td>
                            <button class="btn btn-warning" onclick="editarCliente({})">Editar</button>
                            <button class="btn btn-danger" onclick="deletarCliente({})">Excluir</button>
                        </td>
                    </tr>"#,
                    c.nome,
                    c.cpf_cnpj,
                    c.telefone.as_deref().unwrap_or("-"),
                    c.email.as_deref().unwrap_or("-"),
                    c.cidade.as_deref().unwrap_or("-"),
                    c.id,
                    c.id
                ));
            }
        }

        components::set_inner_html("clientesTable", &html);

        Ok(())
    }
}
