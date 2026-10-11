# Auditoria visual do ERP (11/10/2026)

57 telas alcançáveis pelo menu, logado como Diretoria (login local), banco recém-migrado
(sem dados de negócio). Prints em 1440×900 (`*.desktop.png`) e 390×844 (`*.mobile.png`);
alturas e estouro horizontal de cada tela em `routes.json`. Dinâmicas (`/pedidos/[numero]`,
`/clientes/[id]`, `/funil/[id]/...`, `/producao/...`, `/contrato`, `/captura`) não foram
cobertas: precisam de dados de exemplo.

## O que melhorar visualmente

1. **Menu lateral não cabe em 1440×900.** "Equipe e acessos" fica por baixo do rodapé
   (tema, Conectar, Sair) e o seletor de tema aparece cortado. Viola a regra da casa de
   `docs/ux.md`. Dar `overflow-y-auto` à `<nav>` em `src/components/Sidebar.tsx`, ou agrupar
   itens raros (Simulador, Equipe, Parâmetros) em "Mais", como o celular já faz.
2. **`/parametros/linhas` estoura na horizontal no celular** (421 px de largura útil 390):
   o `<select>` "De onde vem" é mais largo que o cartão. Usar `w-full min-w-0`.
3. **Telas de configuração longas demais** (altura em px, desktop → celular):
   `/parametros/fiscal` 3810 → 6468; `/parametros/categorias-de-contas` 2178 → 4197;
   `/parametros/contrato` 2157 → 2894; `/parametros/formas-de-pagamento` 1464 → 2739;
   `/clientes/novo` 1091 → 1855. Dividir em etapas ou seções recolhíveis (certificado /
   emitente / endereço), uma tarefa por tela.
4. **Linhas de lista com muito ar**: em Formas de pagamento cada item tem "Remover" numa
   segunda linha e botão "Salvar" por linha. Salvar ao sair do campo e `Remover` em menu
   "⋯" reduz a tela quase à metade.
5. **Estados vazios sem ação.** Dashboard com R$ 0 e gráfico em branco; Novo pedido só diz
   "Nenhuma tabela publicada". Mostrar o próximo passo como botão (Publicar tabela) e
   gráfico vazio com mensagem, não uma área em branco.
6. **`/fornecedores` no celular**: formulário de cadastro vem antes da lista (1581 px);
   a lista é o que se procura. Formulário atrás de "+ Novo fornecedor".
7. **Campo de arquivo nativo** ("Choose File / No file chosen", em inglês) em
   `/parametros/fiscal`. Trocar por botão estilizado em português.
8. Dashboard no celular: a barra de baixo cobre o fim do conteúdo; conferir `padding-bottom`
   com `--tabbar`.

(O círculo "N" no canto inferior esquerdo é o indicador do Next em desenvolvimento, não
existe em produção.)

## O que automatizar

- **Auditoria visual no CI:** `shots.mjs` (nesta pasta) loga, descobre as rotas pelos links,
  tira prints nos dois tamanhos e mede estouro horizontal. Falhar o CI quando
  `scrollWidth > clientWidth` em qualquer tela impede regressões como a do item 2.
  Estender para os cinco tamanhos de `docs/ux.md` (360×640, 390×844, 430×932, 1366×768,
  1440×900) e para checar a altura (limite por tela).
- **Prints do manual** (`docs/manual/img`): gerar com o mesmo script em vez de à mão, para
  não envelhecerem.
- **Dados de exemplo (seed) para dev/CI:** hoje as telas dinâmicas e os gráficos não têm o
  que mostrar. Um `npm run db:seed-demo` destrava prints e testes de UI.
- **Regressão visual:** comparar prints com os da `main` (Playwright `toHaveScreenshot`).
- **Acessibilidade:** rodar axe nas mesmas rotas.

## Como reproduzir

```bash
npm i -D playwright-core          # não adicionado ao package.json
ERP_LOCAL_LOGIN=1 npm run dev &   # com banco migrado
node docs/telas-auditoria/shots.mjs docs/telas-auditoria
```
