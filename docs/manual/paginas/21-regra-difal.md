[Manual](../README.md) / Regras de cálculo

# ICMS e DIFAL nas vendas para fora de SP

Como o sistema calcula o ICMS quando o equipamento importado é vendido para outro estado.

**Índice**

1. Alíquota de 4% para importados
2. Quando há DIFAL
3. Exemplo

## Alíquota de 4% para importados

Equipamento importado vendido de SP para outro estado usa a alíquota interestadual de 4% (Resolução do Senado 13/2012, com FCI). Ela está em **Parâmetros**, no campo ICMS interestadual.

## Quando há DIFAL

1.  O DIFAL é a diferença entre a alíquota interna do estado de destino e os 4%.
2.  Quando o cliente **não é contribuinte** do ICMS (pessoa física, academia sem inscrição estadual ou ISENTO), o DIFAL fica com a Ludus e entra no custo do pedido.
3.  Quando o cliente **é contribuinte** (tem inscrição estadual ativa), o recolhimento segue a regra do estado de destino. O desconto máximo usado é o da coluna Máx. c/IE.

## Exemplo

Venda para o Maranhão, cliente não contribuinte: alíquota interna de 23% menos 4% interestadual dá DIFAL de 19% sobre o valor sem IPI, como aparece no quadro Só o diretor vê.

> **Atenção**
>
> Alíquotas internas, fundo de pobreza (FCP) e a forma de cálculo da base são validados pelo contador da Ludus.

---
*Atualizado em 04/10/2026 · Ávila Ops Tecnologia*
