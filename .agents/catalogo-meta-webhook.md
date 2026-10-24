# Catálogos da Meta (Avila Ops Tecnologia): como ler e gravar itens

Workflow do n8n "Catálogo da Meta" (`4SGHJMtC5q5TzzBr`). Substituiu em 09/10/2026 (19:36 UTC) os três
workflows anteriores ("Gravar item", "Listar itens", "Apagar item"), que estão arquivados.

Toda chamada leva o cabeçalho `x-api-key`. URL base e chave em
`/home/avops/.agents/claude/out/catalogo-meta-webhook.env` (creators) e
`/etc/avilaops/segredos/catalogo-meta-webhook.env` (applications). Nunca imprimir a chave.
Atenção: a variável `CATALOGO_META_WEBHOOK_URL` desse arquivo ainda aponta para o caminho antigo
(`/webhook/catalogo-item`); use os caminhos da tabela abaixo.

| Ação | Chamada |
| --- | --- |
| Listar | `GET https://n8n.avilaops.com/webhook/catalogo-listar?catalogo=<catalogo>` |
| Incluir | `POST https://n8n.avilaops.com/webhook/catalogo-incluir` |
| Alterar | `POST https://n8n.avilaops.com/webhook/catalogo-alterar` (só os campos que mudam) |
| Excluir | `POST https://n8n.avilaops.com/webhook/catalogo-excluir` com `{ catalogo, codigo }` |

Formulários com login do n8n: `/form/catalogo-form-incluir` e `/form/catalogo-form-alterar`.

## Catálogos

| `catalogo` | Nome na Meta | ID | Tipo |
| --- | --- | --- | --- |
| `produtos` | Produtos | `1083742241304335` | commerce |
| `assessoria` | Assessoria | `2188737698520466` | services (é o ligado ao WhatsApp do Nicolas) |
| `apps` | Catalog_Apps_and_Software | `864128496722413` | apps_and_software |

## Campos (JSON)

`catalogo`, `codigo`, `nome`, `descricao`, `preco` (número ou `"1.250,00"`), `link`, `disponibilidade`
(`disponivel` / `indisponivel`), `imagem_url` (https) ou `imagem_base64` (JPG/PNG, com `mime` opcional).
A imagem em base64 sobe para `midia.avilaops.com/catalogo/<catalogo>/...`.

Para **trocar só a foto**: `catalogo-alterar` com `catalogo`, `codigo` e a imagem.

Respostas: `{ ok, acao, status, mensagem, catalogo, codigo, imagem_url }`. A Meta leva de 5 a 15 s para
refletir na listagem.

## Pelo MCP

As mesmas ações existem como ferramentas no servidor MCP `avilaops` (ver `~/.agents/mcp-avilaops.md`).

## Limites

- Token da Meta = usuário do sistema "Claude" (credencial n8n "WhatsApp account"), funcionário: grava
  itens, mas não cria catálogo nem dá acesso a catálogo.
- O app WhatsApp Business liga **um** catálogo, pelo celular (Gerenciador de Catálogos).
