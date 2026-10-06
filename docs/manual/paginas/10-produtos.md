[Manual](../README.md) / Cadastros

# Produtos e custos

Como cadastrar equipamentos, lançar o custo da assessoria e publicar a tabela para a equipe.

**Índice**

1. Visão geral da tela
2. Cadastrar um equipamento
3. Lançar ou colar custos
4. Colunas da tabela
5. Publicar a tabela para a equipe
6. Desativar ou excluir
7. Fotos e descrições em lote

Acesse o menu **Produtos e custos**. Esta tela é exclusiva da diretoria.

![Produtos e custos com o aviso de tabela pendente e o botão Publicar](../img/produtos-custos.jpg)
*Produtos e custos com o aviso de tabela pendente e o botão Publicar*

## Visão geral da tela

Digite o custo que a assessoria passar. O preço de tabela e os descontos máximos recalculam na hora, mas a equipe só vê a mudança depois que você publicar.

1.  Abas: **Ativos**, **Sem custo**, **Sem código** e **Inativos**. Use Sem custo e Sem código para achar cadastros incompletos.
2.  Busca por nome, código ou fornecedor.
3.  O contador no canto mostra o total de itens e a margem de segurança aplicada no custo (hoje 5%).

## Cadastrar um equipamento

1.  Clique em **\+ Equipamento**.
2.  Informe o nome (ex.: MESA FLEXORA - BATERIA DE PESOS), o código Ludus (ex.: LD-B001) e a referência do fornecedor, como o modelo da fábrica e o preço em dólar.
3.  Lance o custo da assessoria e salve.

## Lançar ou colar custos

1.  Para um item, digite direto no campo **Custo assessoria R$**.
2.  Para vários itens, clique em **Colar custos da assessoria** e cole a planilha que a assessoria enviou.

## Colunas da tabela

| Coluna | O que é |
| --- | --- |
| Equipamento | Nome, código Ludus e referência do fornecedor (modelo e preço em US$). |
| Custo assessoria R$ | Custo nacionalizado informado pela assessoria. |
| Crédito imp. | Percentual de impostos que a Ludus recupera como crédito. |
| Embalagem R$ | Custo extra de embalagem, quando houver. |
| Custo real | Custo usado no cálculo, já com créditos e margem de segurança. |
| Tabela s/IPI | Preço de tabela sem IPI. O valor com IPI aparece abaixo. |
| Máx. SP | Desconto máximo mantendo a meta em uma venda dentro de SP. |
| Máx. c/IE | Desconto máximo mantendo a meta para cliente contribuinte (com inscrição estadual). |

## Publicar a tabela para a equipe

Quando há alterações não publicadas, aparece o aviso "A equipe ainda vê a tabela v35" com o que está pendente.

1.  Confira os valores.
2.  Clique em **Publicar v36**. A equipe passa a vender com a nova tabela, e a versão anterior fica guardada.

## Desativar ou excluir

1.  **Desativar** tira o equipamento da venda, mas mantém o histórico. Ele vai para a aba Inativos.
2.  **Excluir** remove o cadastro. Use só para itens lançados por engano.

## Fotos e descrições em lote

Cada equipamento pode ter uma descrição e uma foto. Para cadastrar tudo de uma vez, envie o material à Ávila Ops: a carga é feita por nós, não pela tela.

O material é uma pasta com uma planilha e as fotos:

1.  **Planilha** `equipamentos.csv` (no Excel: Salvar como, CSV UTF-8, separado por ponto e vírgula), com uma linha por equipamento e a primeira linha com o nome das colunas.
2.  **Fotos** em uma pasta chamada `fotos`, uma por equipamento, com o **código do equipamento como nome do arquivo**: `LD-B001.jpg`, `LD-B002.png`. Valem JPG, PNG e WebP, de até 15 MB cada.

| Coluna | O que é |
| --- | --- |
| codigo | Código Ludus do equipamento (ex.: LD-B001). Só letras, números, hífen, sublinhado e ponto. Obrigatório. |
| nome | Nome do equipamento. Obrigatório. |
| descricao | Texto de descrição. Pode ficar em branco. |
| fornecedor | Nome da fábrica. Opcional. |
| modelo | Modelo da fábrica. Opcional. |
| preco_usd | Preço do fornecedor em dólar (ex.: 1234.56 ou 1.234,56). Opcional. |

O que acontece na carga:

1.  Código novo vira um equipamento novo, ainda sem custo: ele aparece na aba **Sem custo** até a diretoria lançar o custo da assessoria.
2.  Código que já existe tem o nome atualizado. Descrição e dados do fornecedor só mudam se vierem preenchidos: campo em branco não apaga o que já está cadastrado.
3.  Custo, crédito de impostos, embalagem e a situação ativo ou inativo nunca são alterados pela carga.
4.  A foto é guardada em tamanho reduzido. Enviar uma foto nova para o mesmo código troca a anterior.
5.  Se houver erro na planilha ou em alguma foto, nada é gravado e a Ávila Ops devolve a lista do que corrigir.

---
*Atualizado em 06/10/2026 · Ávila Ops Tecnologia*
