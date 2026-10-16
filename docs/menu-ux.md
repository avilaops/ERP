# Organização do menu

O menu organiza somente os destinos autorizados pelo servidor em seis grupos:
Visão geral, Vendas, Preços e propostas, Financeiro, Produtos e operação e
Administração. Grupos vazios não aparecem. O grupo da página atual começa aberto;
abrir outro grupo ou Minha conta recolhe o anterior.

Os quatro atalhos móveis e Novo pedido permanecem disponíveis. Minha conta reúne
identificação completa, aparência, conexão do assistente, troca de empresa e saída.
Painel e Configurações são os nomes apresentados na navegação, sem alterar rotas
ou permissões.

## Verificação das sete perguntas de UX

1. **Tarefa clara:** grupos nomeados por assunto e Novo pedido separado da navegação.
2. **Informação que decide:** a página atual tem destaque e `aria-current`; o seu
   grupo começa aberto. A identidade completa fica em Minha conta.
3. **Ação principal:** Novo pedido continua sendo a ação principal do menu; abrir
   grupos não envia formulários nem altera o pedido em edição.
4. **Cinco tamanhos:** o teste mede 360×640, 390×844, 430×932, 1366×768 e 1440×900.
   Com os grupos recolhidos, o conteúdo cabe na área do menu; detalhes abertos
   podem rolar. Não há rolagem horizontal nem controles abaixo de 44 px no menu.
5. **Detalhes acessíveis:** os grupos e Minha conta abrem por controles nomeados,
   sem cortar nomes, reduzir fontes ou esconder conteúdo que deveria ser legível.
6. **Continuidade:** abrir ou fechar o menu e seus grupos preserva a página ao fundo;
   escolher um destino navega e fecha o menu no celular. Voltar à página abre o
   grupo correspondente ao endereço atual.
7. **Teclado e texto ampliado:** o teste usa Enter nos controles nativos de abertura
   e confere nomes inteiros e alcance dos links com texto ampliado para 200%.

## Evidências reproduzíveis

- `tests/navigation.test.ts`: organização, cobertura dos destinos e permissões.
- `tests/visual/menu.spec.ts`: abertura exclusiva, conta, destino ativo, teclado,
  texto ampliado, medidas e capturas nos cinco tamanhos.
- No CI, as capturas ficam em `test-results/menu`, separadas da varredura geral
  para não serem apagadas pela execução seguinte do Playwright.

O teste do menu não comprova a conformidade de todas as telas do ERP; a varredura
geral permanece uma verificação separada.
