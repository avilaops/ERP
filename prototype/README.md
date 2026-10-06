# Protótipo do Rogério (referência)

`ludus-comercial.html` é o artifact "Ludus Comercial" que o Rogério montou no Claude,
copiado em 06/10/2026 de <https://claude.ai/artifact/Bcm96Qu2hX7EcrjQPhcXiw>.

- **É só referência.** Nada daqui é importado pela aplicação, e o arquivo não se edita:
  quando o Rogério mudar o protótipo, copia-se de novo por cima.
- **Não tem números da empresa.** Parâmetros, equipamentos, custos e alíquotas por UF
  ficam no banco do próprio artifact (`privado/config`, `privado/produtos`), que só o
  dono lê. Por isso não há dado de exemplo nesta pasta.
- O motor de cálculo é o bloco `<script id="engine">` (objeto `ENG`).

O inventário de telas, entidades, regras e divergências está em
[`docs/copilot/inventario-prototipo.md`](../docs/copilot/inventario-prototipo.md).
