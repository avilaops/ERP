# Servidor MCP `avilaops` (n8n)

Workflow "MCP - Avila Ops" (`IwW8JvEPEkBb6yah`), em `https://n8n.avilaops.com/mcp/avilaops`, protegido
por token (cabeçalho `Authorization: Bearer ...`). URL e token em
`/home/avops/.agents/claude/out/mcp-avilaops.env` (creators) e `/etc/avilaops/segredos/mcp-avilaops.env`
(applications). Nunca imprimir o token.

No Claude Code do `creators` já está registrado (escopo do usuário) com o nome `avilaops`.
Em outra máquina:

```bash
claude mcp add --scope user --transport http avilaops https://n8n.avilaops.com/mcp/avilaops --header "Authorization: Bearer <token>"
```

## Ferramentas (testadas com chamadas reais em 09/10/2026)

| Ferramenta | O que faz |
| --- | --- |
| `whatsapp_estado` | números conectados no serviço de envio e o estado de cada um |
| `posts_fila` | os 20 posts mais recentes da fila, com situação por canal |
| `post_agendar` | agenda post de texto ou foto para `whatsapp` (conversa do próprio número), `status` (Status do WhatsApp, público da tabela `whatsapp_status_publico`), `canal` (canal público), `instagram` (@avila.ops, exige JPG) e `facebook` (Página Avila Ops Tecnologia) |
| `catalogo_listar` | itens de um catálogo da Meta |
| `catalogo_incluir` | inclui item novo |
| `catalogo_alterar` | altera só os campos informados de um item |
| `catalogo_excluir` | exclui item (sem volta) |
| `contato_buscar` | até 20 contatos por parte do nome ou do número (tabela `whatsapp_contatos`, foto de 09/10/2026) |

## Cuidados

- `post_agendar` grava direto na fila: não confere se o WhatsApp está conectado. Chamar `whatsapp_estado`
  antes.
- `canal` publica para todos os seguidores; `catalogo_*` no catálogo `assessoria` aparece no perfil do
  WhatsApp. Confirmar com o Nicolas antes de publicar ou excluir.
- Não há ferramenta para enviar mensagem a um contato qualquer, de propósito.
