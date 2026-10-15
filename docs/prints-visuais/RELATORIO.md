# Prints e análise visual do ERP

Capturas de 25 rotas em 1440×900 (`desktop-*`) e 390×844 (`mobile-*`), perfil Diretoria, banco
vazio (só migrações). Gerado por script Playwright; `report.json` traz as medidas por tela.

## O que foi visto

- 24 de 25 rotas respondem 200 e sem rolagem horizontal em nenhum dos dois tamanhos.
- `/producao` redireciona para `/sem-acesso` (módulo desligado na empresa); `/empresa` redireciona para `/dashboard`.
- Visual consistente: títulos condensados, cartões de indicadores, abas, moldura mobile com barra inferior.

## Melhorias visuais

1. **Menu lateral no desktop passa da altura (1366×768 e 1440×900).** São 19 itens em lista única; `Parâmetros` e `Simulador` ficam no limite da tela (no print, o botão do Next dev cobre um deles). Agrupar (Vendas / Financeiro / Cadastros) com títulos de seção ou colapsar grupos poupa rolagem.
2. **Estados vazios sem chamada para ação.** `/dashboard` mostra o gráfico "Vendas fechadas por mês" como uma caixa vazia e `R$ 0` em todos os cartões; `/pedidos` mostra só uma frase. Um estado vazio com botão ("Criar primeiro pedido", "Importar produtos") e gráfico oculto sem dados.
3. **`/fornecedores` abre direto no formulário de criação** (1581 px de altura no mobile, 14 controles < 44 px). A lista de fornecedores deveria vir primeiro, com "+ Novo fornecedor" abrindo o formulário (regra "uma tela, uma tarefa" do `docs/ux.md`); os campos de pagamento (banco, agência, SWIFT) podem ficar num `<details>`.
4. **Controles abaixo de 44 px.** Mobile: `/contas-pagar` (12), `/fornecedores` (14), `/funil` (9), `/pedidos` (8). Desktop conta ~25 por causa dos itens do menu (40 px); subir para 44 px alinha com `docs/ux.md`.
5. **`/dashboard` e `/parametros` rolam no mobile** (1090 e 1133 px). Aceitável, mas os 8 cartões do Resumo poderiam ser 4 + "Ver mais".
6. **Formulários longos** (`/produtos/novo`, 983 px no mobile) pedem etapas (`?etapa=`) conforme o `docs/ux.md`.
7. **Densidade em telas vazias:** a área à direita/abaixo fica vazia no desktop (`/pedidos`, `/parametros`); limitar largura ou usar painel lateral de ajuda.

## O que automatizar

1. **Teste visual no CI:** transformar o script de captura (Playwright, as mesmas rotas e os 5 tamanhos do `docs/ux.md`) em job que falha se houver rolagem horizontal, controle < 44 px ou `overflow: hidden` cortando conteúdo, e anexa os prints ao PR.
2. **Dados de demonstração:** criar um script de seed (clientes, produtos, pedidos; o ERP ainda não tem) para as telas serem avaliadas com conteúdo real; hoje o banco vazio esconde problemas de tabela, paginação e nomes longos.
3. **Login local + migração em um comando** (`npm run dev:demo`): hoje exige criar banco, `.env.local`, migrar e entrar em `/dev/login` à mão.
4. **Manual com prints atualizados:** o `docs/manual` tem prints manuais; gerar a partir do mesmo script a cada release.
5. **Acessibilidade:** rodar `axe-core` no mesmo laço (contraste dos textos cinza pequenos dos cartões, rótulos de campos).

## Escopo

Só o ERP foi capturado (único com login local e Postgres disponível no ambiente). Os demais apps (TMS, lojas, auth, CRM, site, n8n) não foram rodados.
