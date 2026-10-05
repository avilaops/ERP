# Prompts para o Copilot: ERP Ludus

O contexto permanente está em [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md). O Copilot lê esse arquivo sozinho em toda conversa. Use os prompts abaixo no Copilot Chat em modo Agent, um por vez, na ordem do [roadmap](../roadmap.md).

## 0. Preparar o protótipo (manual, antes do primeiro prompt)

1. Abra o artifact do Rogério no Claude (acesso de editor para nicolas@avilaops.com).
2. Copie o código completo do artifact para `prototype/app.jsx` (ou o nome original do arquivo).
3. Se houver dados de exemplo no protótipo (equipamentos, parâmetros), salve também em `prototype/data/`.
4. Commit: `chore: código do protótipo como referência`.

## Fase 1. Infraestrutura e acessos (05/10 a 09/10)

```text
Siga .github/copilot-instructions.md.

Leia prototype/ inteiro e faça um inventário em docs/copilot/inventario-prototipo.md:
telas, componentes, entidades e campos, regras e fórmulas, textos de ajuda. Aponte
qualquer regra do protótipo que divirja das instruções do projeto.

Depois crie a base do projeto:
1. Next.js com TypeScript strict, App Router, Tailwind, ESLint e pnpm.
2. Prisma com PostgreSQL (DATABASE_URL no .env.example) e docker-compose com
   postgres:16 para desenvolvimento local.
3. Schema Prisma completo, com tipos NUMERIC para dinheiro e enums do Postgres:
   Organization, User (role: DIRETORIA | GERENTE_COMERCIAL | VENDEDOR | FINANCEIRO),
   AuditLog (JSONB antes/depois), Settings (parâmetros com histórico),
   StateTaxRate (UF, alíquota interna, FCP, observação),
   Supplier, Product (código LD-xxx, nome, ref. fornecedor, preço US$, NCM, IPI,
   custo assessoria, crédito de impostos, embalagem, ativo), PriceTableVersion
   (número, snapshot JSONB, publicada_em, publicada_por),
   Customer (PF/PJ, IE, contribuinte, endereço), Order, OrderItem, Approval,
   LostReason, Receivable, Payable, Commission, SalesGoal.
4. Migration inicial e seed com os equipamentos, parâmetros e alíquotas por UF
   do protótipo.
5. Integração com o Auth central da Ávila Ops isolada em src/lib/auth/
   (getSession, requirePermission). Para desenvolvimento e testes, um provedor
   local com um usuário por perfil, habilitado SOMENTE quando NODE_ENV for
   development ou test. Em produção, credenciais do Auth central ausentes ou
   inválidas fazem a aplicação falhar na inicialização (falha fechada).
   Teste automatizado que garante que o provedor local não existe no build de
   produção.
6. Layout com a sidebar do protótipo (logo, card "Seu acesso", botão
   + Novo pedido) mostrando só os itens do perfil.

Ao final: o que foi criado, como rodar localmente e o que ficou pendente.
```

## Fase 2. Porte do protótipo (12/10 a 23/10)

### 2a. Motor de cálculo
```text
Siga .github/copilot-instructions.md.

Porte TODAS as fórmulas do protótipo para src/modules/pricing/ como funções puras
com Prisma.Decimal: custo real, impostos e taxas por UF e contribuinte, DIFAL,
preço de tabela, preço com IPI, desconto máximo (Máx. SP e Máx. c/IE), faixa do
desconto (na meta / abaixo / prejuízo), lucro líquido do pedido, entrada mínima,
parcelas do saldo e comissão.

Escreva testes Vitest que reproduzam os números do protótipo, incluindo:
- entrada mínima: China 8.553,97 + lucro 2.304,55, comissão 2% = 11.054,17
- multiplicador de tabela com os parâmetros iniciais: custo x 3,123
- venda para MA (não contribuinte): DIFAL 19%
- parcelas que somam exatamente o saldo
Compare cada resultado com o protótipo e liste divergências antes de seguir.
```

### 2b. Produtos e custos, Parâmetros e Tabela de preços
```text
Siga .github/copilot-instructions.md e reproduza as telas do protótipo:
- Produtos e custos: abas Ativos / Sem custo / Sem código / Inativos, busca,
  edição inline dos custos, "Colar custos da assessoria" (colar planilha),
  "+ Equipamento", Desativar/Excluir, aviso "A equipe ainda vê a tabela vN"
  e botão "Publicar vN+1" que grava o snapshot em PriceTableVersion.
- Parâmetros: política comercial, impostos da venda, canal e o quadro Resultado
  com a fórmula explicada e o botão "usar" na entrada mínima sugerida.
- Tabela de preços: a versão publicada, sem custo nem margem para quem não é
  diretoria.
Só a DIRETORIA acessa Produtos e custos e Parâmetros. Registrar tudo no audit_log.
```

### 2c. Pedidos, aprovações e simulador
```text
Siga .github/copilot-instructions.md e reproduza o fluxo de pedido do protótipo:
- Lista de pedidos com os cards (Em negociação, Fechado no mês, Taxa de
  fechamento, Desconto médio fechado), abas por situação e busca.
- Pedido: equipamentos, cliente PF/PJ com CEP, entrega e condições, desconto com
  barra e faixa colorida, resumo, forma de pagamento com parcelas e o bloco de
  recebimentos com comissão por parcela.
- Quadro "Só o diretor vê" calculado no servidor e enviado só para a DIRETORIA.
- Envio automático para aprovação pelas regras do projeto; tela Aprovações para
  GERENTE_COMERCIAL e DIRETORIA, com aprovar/reprovar e comentário.
  Pedido com lucro negativo só é aprovado pela DIRETORIA (checagem no servidor);
  para o gerente ele aparece como "requer aprovação da diretoria", sem valores.
- Clientes: lista com busca por nome, CNPJ/CPF e cidade, cadastro e edição
  PF/PJ fora do pedido (CEP preenche o endereço; IE define contribuinte),
  histórico de pedidos do cliente. Vendedor vê só os próprios clientes.
- Copiar proposta (texto) e Salvar PDF com a marca da Ludus.
- Fechar pedido gera os Receivable. Reabrir pedido exige confirmação e
  recalcula recebimentos e comissões ainda não pagos.
- Simulador: mesma conta do pedido sem gravar nada.
Testes Playwright: (1) vendedor cria pedido com 25% de desconto, pedido vai
para aprovação, gerente aprova, vendedor fecha; (2) pedido com prejuízo não
pode ser aprovado pelo gerente, só pela diretoria.
```

### 2d. Financeiro, comissões e dashboard
```text
Siga .github/copilot-instructions.md e reproduza:
- Recebimentos: lista por vencimento e situação, baixa total ou parcial.
- Contas a pagar: lançamento, vencimento, baixa, vínculo opcional com pedido
  (pagamento da China) e fornecedor.
- Fornecedores: CNPJ, CPF ou exterior.
- Comissões: seletor "Recebido em mês/ano -> pago 05/mês seguinte", cards,
  tabela por vendedor, "Marcar como paga", lançamentos e "Baixar relatório" (CSV).
- Preços e metas: meta mensal da equipe e de cada vendedor (SalesGoal), com
  edição pela DIRETORIA e GERENTE_COMERCIAL e histórico por mês.
- Dashboard: filtros de período e equipe, cards, vendas por mês (12 meses, com
  IPI), funil, ranking de vendedores com % da meta do mês e top 8 equipamentos
  (sem IPI). Todas as
  agregações em SQL no Postgres.
Teste Playwright: dar baixa em uma parcela e conferir a comissão do mês.
```

## Fase 3. Carga e treinamento (26/10 a 30/10)

```text
Siga .github/copilot-instructions.md.
1. Script de importação (CSV/planilha) de equipamentos com fotos, códigos e
   descrições, com validação e relatório de erros. Fotos em storage de objetos;
   nome do arquivo = código do produto.
2. Tela Equipe e acessos: convidar usuário por e-mail, definir perfil, desativar.
3. Revisão de segurança: permissão em toda action e query, nenhum campo sensível
   no payload de VENDEDOR/GERENTE (teste automatizado que verifica isso),
   rate limit, headers de segurança.
4. Backup diário do Postgres (pg_dump) com retenção de 30 dias e procedimento de
   restauração documentado em docs/operacao.md.
5. Pipeline GitHub Actions: lint, typecheck, testes, build e deploy.
```

## Fase 4. Fiscal no cálculo (03/11 a 13/11)

```text
Siga .github/copilot-instructions.md.
1. Cadastro fiscal do produto: NCM, CEST, origem (1 = importação direta), IPI.
2. Tabela StateTaxRate validada pelo contador (alíquota interna e FCP por UF);
   tela de manutenção só para DIRETORIA.
3. ICMS e DIFAL separados no custo e no pedido, com base de cálculo conforme o
   contador definir (simples ou "por dentro"), configurável em Parâmetros.
4. Relatório de impostos por período.
Testes com uma venda para SP, uma para MA (não contribuinte) e uma para
contribuinte de outro estado.
```

## Fase 5. Orçamento e celular (16/11 a 27/11)

```text
Siga .github/copilot-instructions.md.
1. PDF do orçamento com logo da Ludus e miniatura da foto de cada equipamento.
2. PWA instalável (manifest, ícones, service worker para o shell), com telas de
   pedido e lista otimizadas para celular.
3. Envio do orçamento pelo WhatsApp (link com o texto da proposta).
```

## Fase 6. NF-e (a definir)

Depende do certificado digital A1 da Ludus e da escolha do emissor. Quando decidido, criar o prompt a partir de `docs/copilot/inventario-prototipo.md` e das regras da fase 4.
