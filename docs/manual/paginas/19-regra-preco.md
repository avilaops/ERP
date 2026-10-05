[Manual](../README.md) / Regras de cálculo

# Preço de tabela e desconto máximo

Como o sistema transforma o custo da assessoria no preço de tabela.

**Índice**

1. Passo a passo do cálculo
2. Por que existe um pior caso

## Passo a passo do cálculo

1.  **Custo real** = custo da assessoria, menos os créditos de imposto, mais embalagem e a margem de segurança da importação (5%).
2.  **Venda com desconto** = custo real ÷ (1 − impostos e taxas − lucro antes do IR necessário). É o menor preço que ainda entrega a meta de 15%.
3.  **Preço de tabela** = venda com desconto ÷ (1 − desconto livre do vendedor). Assim, mesmo com 20% de desconto, a venda continua na meta.

```
tabela = custo real ÷ (1 − impostos e taxas − lucro antes do IR) ÷ (1 − desconto livre)
```

## Por que existe um pior caso

Os impostos mudam conforme o estado de entrega. O sistema calcula a tabela pelo estado mais caro (hoje o Maranhão, com ICMS + DIFAL de 23%). Em vendas para estados mais baratos, sobra mais margem, e por isso o desconto máximo do item é maior.

---
*Atualizado em 04/10/2026 · Ávila Ops Tecnologia*
