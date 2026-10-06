# Prompts para o Copilot: ERP Ávila Ops

O contexto permanente está em [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md), que o Copilot lê sozinho em toda conversa, e as regras por pasta estão no [`AGENTS.md`](../../AGENTS.md). Use os prompts abaixo no Copilot Chat em modo Agent, um por vez, na ordem do [roadmap](../roadmap.md).

Revisto em 06/10/2026 para a stack que está no código: PostgreSQL com `pg` e SQL direto (migrações em `db/migrations/`), `src/lib/` e `src/app/(app)/`, npm, testes com o executor do Node, endereço `erp.avilaops.com`. Não há Prisma, SQLite, Vitest, Playwright, pnpm, `src/modules/`, `organization_id` nem `audit_log`. O sistema é multi-empresa, com um esquema do banco por empresa: toda tela e ação usa `tenantDb(session.tenant.slug)`, e nada de uma empresa fica fixo no código.

Todo prompt termina do mesmo jeito: `npm run lint`, `npm run typecheck`, `npm test` (nenhum teste pulado) e `npm run build`, e commit direto na `main`.

## Situação em 06/10/2026

| Parte | Situação |
| --- | --- |
| 0. Protótipo no repositório e inventário | Feito: `prototype/ludus-comercial.html` e [`inventario-prototipo.md`](inventario-prototipo.md) |
| 1. Base, login com os quatro perfis, sidebar, CI | Feito, menos o ambiente de produção |
| 1. Produção em `erp.avilaops.com` | Pendente (prompt 1) |
| 2a. Motor de cálculo | Feito (`src/lib/pricing/`) |
| 2b. Parâmetros, Produtos e custos, publicação, Tabela de preços | Feito |
| 2c. Clientes e pedido em negociação | Feito |
| 2c. Pagamento, fechar pedido, lista de pedidos, aprovações, simulador | Pendente (prompts 2c-1 e 2c-2) |
| 2d. Financeiro, comissões e dashboard | Pendente |
| 3 a 6 | Pendentes |

Antes dos prompts 2c-2 e 2d, resolver com o Nicolas as divergências da seção 7 do inventário (motivos de aprovação, alçada do gerente, provisões, taxa fixa por pedido, alíquotas por UF).

## Fase 1. Infraestrutura e acessos

### 1. Produção em erp.avilaops.com (pendente)
```text
Siga .github/copilot-instructions.md, AGENTS.md e docs/operacao.md.

Coloque o ERP no ar em https://erp.avilaops.com:
1. Serviço da aplicação no servidor (next build + next start), reiniciando sozinho.
2. PostgreSQL de produção separado do de desenvolvimento, com pg_dump diário,
   retenção de 30 dias e restauração testada.
3. TLS válido de ponta a ponta para erp.avilaops.com.
4. Variáveis reais só no servidor: DATABASE_URL, SSO_JWT_SECRET (o mesmo do
   auth.avilaops.com), APP_URL=https://erp.avilaops.com e ERP_USERS. Sem elas a
   aplicação não pode subir (falha fechada, já implementada).
5. No .github/workflows/ci.yml, depois do build na main: aplicar as migrações
   (npm run db:migrate) e reiniciar o serviço.
Atualize docs/operacao.md com o que foi feito.

Pronto quando: cada um dos 4 perfis entra por https://erp.avilaops.com e vê só a
sua parte do sistema.
```

## Fase 2. Porte do protótipo

O protótipo é a referência: consulte `prototype/ludus-comercial.html` e o inventário antes de portar tela ou regra. As especificações detalhadas de cada parte já entregue estão registradas nos commits e nos testes.

### 2c-1. Pagamento, fechar pedido e lista de pedidos (pendente)
```text
Siga .github/copilot-instructions.md e AGENTS.md. O pedido em negociação já existe
(src/lib/db/orders.ts, src/lib/order-quote.ts, src/app/(app)/pedidos/). A migração
0005 já tem as colunas de pagamento.

- Forma de pagamento: entrada em R$ ou %, forma, data (vazia = na confirmação);
  saldo com forma, nº de parcelas, 1ª em N dias e intervalo. As parcelas somam
  exatamente o saldo, com a diferença de centavos na última (installments, em
  src/lib/pricing/payment.ts). Aviso "Entrada OK" ou "Entrada abaixo do mínimo",
  com o percentual mínimo da versão do pedido.
- Fechar pedido: confere no servidor o que falta (cliente completo, estado de
  entrega, prazo, pagamento) e a política (policyCheck). Dentro da política vira
  fechado; fora, aguardando_aprovacao, com os motivos escritos.
- Reabrir (fechado → em negociação, a versão da tabela não muda) e excluir (só em
  negociação, pedido e itens na mesma instrução SQL).
- Pedidos: cards (Em negociação, Fechado no mês, Taxa de fechamento, Desconto
  médio fechado), abas por situação, busca por cliente, documento ou número. O
  vendedor só vê os próprios (seesAllOrders decide).
- As somas dos indicadores ficam em src/lib/pricing/, não em SQL nem na tela.
Testes: pagamento do print (nota 114.708,28, entrada 75.000,00, 3 parcelas →
13.236,09, 13.236,09 e 13.236,10); pedido do print com entrada de 25.000,00 vai
para aprovação e com 30.000,00 fecha.
```

### 2c-2. Aprovações e simulador (pendente; depende das decisões do inventário)
```text
Siga .github/copilot-instructions.md e AGENTS.md.

- Aprovações, para GERENTE_COMERCIAL e DIRETORIA: fila dos pedidos aguardando
  aprovação, aprovar ou reprovar com comentário. A aprovação fica presa ao que foi
  aprovado (itens, quantidades, desconto, UF, contribuinte, frete, entrada e
  parcelas); mudou, perde a validade. Pedido com prejuízo só a DIRETORIA aprova,
  e o gerente vê apenas "requer aprovação da diretoria", sem valores.
- Simulador: a mesma conta do pedido, sem gravar nada, com as mesmas travas de
  quem vê custo (seesCosts).
- Copiar proposta (texto) com a marca da Ludus.
Tabela nova em db/migrations/, sem ON DELETE CASCADE. Testes de banco para cada
transição e teste de que nada de custo vai para quem não é Diretoria.
```

### 2d. Financeiro, comissões e dashboard (pendente)
```text
Siga .github/copilot-instructions.md e AGENTS.md.

- Recebimentos: parcelas a receber nascem do pedido fechado. Lista por vencimento
  e situação, baixa total ou parcial. A soma das baixas nunca passa do valor da
  parcela e a dos estornos nunca passa do recebido, garantido no banco (teste com
  duas baixas ao mesmo tempo). Fila de devoluções pendentes para confirmar.
- Comissão: 2% sobre cada valor recebido, sem IPI; nasce na baixa; tudo recebido
  no mês é pago no dia 05 do mês seguinte (commissionOn e commissionPaymentDate já
  existem em src/lib/pricing/commission.ts). Tela com seletor de mês, cards, tabela
  por vendedor, "Marcar como paga" e relatório em CSV.
- Contas a pagar e Fornecedores (CNPJ, CPF ou exterior).
- Preços e metas: meta mensal da equipe e de cada vendedor.
- Dashboard: filtros de período (Este mês, 3 meses, Ano, 12 meses) e de equipe,
  cards, vendas por mês, funil, ranking e top equipamentos.
- Custo, China e lucro só para a DIRETORIA (seesCosts), nunca no HTML dos outros.
Testes de banco: baixa de uma parcela gera a comissão do mês certo, inclusive na
virada (23:30 de 30/09 em São Paulo é setembro).
```

## Fase 3. Carga e treinamento

```text
Siga .github/copilot-instructions.md e AGENTS.md.
1. Importação de equipamentos (planilha) com código, nome, custo, crédito e
   embalagem, com validação e relatório de erros; fotos por código do produto.
2. Equipe e acessos: os usuários passam de ERP_USERS para o banco (trocar a
   implementação de UserDirectory em src/lib/auth/directory.ts, não quem a usa).
3. Revisão de segurança: permissão em toda página e ação; teste por perfil de que
   custo, China, lucro e margem não chegam a VENDEDOR, GERENTE_COMERCIAL nem
   FINANCEIRO; headers de segurança.
4. pg_dump diário do banco do ERP com retenção de 30 dias e restauração
   documentada em docs/operacao.md.
5. Pedido real de ponta a ponta com o Rogério (orçamento, aprovação, fechamento,
   recebimento e comissão), comparado com o protótipo. Aceite em
   docs/aceite-fase3.md.
6. Roteiro de treinamento por perfil a partir de docs/manual e checklist de
   entrada em operação (erp.avilaops.com no ar, login dos quatro perfis, backup
   rodando, tabela publicada, usuários ativos).
```

## Fase 4. Fiscal no cálculo (03/11 a 13/11)

```text
Siga .github/copilot-instructions.md e AGENTS.md.
1. Cadastro fiscal do produto: NCM, CEST, origem (1 = importação direta), IPI.
2. Alíquotas por UF no banco, validadas pelo contador (alíquota interna e FCP;
   hoje são constante em src/lib/pricing/states.ts, sem FCP); tela de manutenção
   só para DIRETORIA. As versões já publicadas da tabela não mudam.
3. ICMS, DIFAL e FCP/FECP separados no custo, no pedido e na tabela de preços, com base de cálculo conforme o
   contador definir (simples ou "por dentro"), configurável em Parâmetros.
4. Relatório de impostos por período.
Testes com uma venda para SP, uma para MA (não contribuinte), uma para estado
com FCP diferente de zero e uma para
contribuinte de outro estado.
```

## Fase 5. Orçamento e celular (16/11 a 27/11)

```text
Siga .github/copilot-instructions.md e AGENTS.md.
1. PDF do orçamento com logo da Ludus e miniatura da foto de cada equipamento.
2. PWA instalável (manifest, ícones, service worker para o shell), com telas de
   pedido e lista otimizadas para celular.
3. Envio do orçamento pelo WhatsApp (link com o texto da proposta).
```

## Fase 6. NF-e (a definir)

Depende do certificado digital A1 da Ludus e da escolha do emissor. Quando decidido, criar o prompt a partir de `docs/copilot/inventario-prototipo.md` e das regras da fase 4.
