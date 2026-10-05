[Manual](../README.md) / Regras de cálculo

# Entrada mínima do pedido

Como é calculada a entrada que o cliente precisa pagar para o pedido ser aprovado.

**Índice**

1. Fórmula
2. Exemplo
3. Onde aparece

## Fórmula

A entrada precisa cobrir o pagamento na China, a comissão do vendedor sobre a própria entrada e o lucro líquido da meta. O lucro é garantido na entrada porque o equipamento leva de 60 a 90 dias para chegar.

```
entrada mínima = (valor da China + lucro líquido da meta) ÷ (1 − comissão)
```

A divisão existe porque o vendedor ganha 2% sobre o que o cliente paga (sem IPI), e isso sai da própria entrada.

## Exemplo

Mesa Flexora com 20% de desconto, venda dentro de SP:

| Item | Valor |
| --- | --- |
| Pagar na China | R$ 8.553,97 |
| Lucro líquido da meta | R$ 2.304,55 |
| Comissão sobre a entrada | R$ 195,65 |
| Entrada mínima | R$ 11.054,17 (64% da nota) |

Conferência: tirando a comissão da entrada, sobram R$ 10.858,52, que é o valor da China mais o lucro.

## Onde aparece

1.  No pedido, o quadro Só o diretor vê mostra a conta parte por parte. Se a entrada combinada for menor, aparece um aviso com quanto falta.
2.  No Simulador, a mesma conta.
3.  Em Parâmetros, a entrada mínima sugerida usa essa regra. Vendedores e gerente veem só o percentual mínimo da política.

---
*Atualizado em 04/10/2026 · Ávila Ops Tecnologia*
