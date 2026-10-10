# Conformidade da NF-e com as normas

Auditoria de 10/10/2026 da emissão de NF-e (modelo 55, leiaute 4.00) do ERP: o que cada norma
pede, onde o sistema atende, como isso é testado e o que ficou pendente. Vale para o que o sistema
emite hoje: **venda de mercadoria, de saída, por empresa de São Paulo, em emissão normal**.
CT-e e MDF-e são do TMS e não estão aqui.

Situações usadas nas tabelas: **confere** (o código já atendia), **corrigido** (estava em desacordo
e foi corrigido nesta auditoria, com teste), **pendente** (em desacordo ou incompleto, com o
motivo) e **não emite** (o sistema não tem a operação; nada a conferir).

## 1. Normas conferidas

Todas baixadas do Portal Nacional da NF-e (`www.nfe.fazenda.gov.br/portal`) em 10/10/2026 e lidas
no texto publicado. "Produção" é a data em que a regra passa a valer no ambiente de produção.

| Norma | Versão e publicação | Assunto | Produção |
| --- | --- | --- | --- |
| Manual de Orientação do Contribuinte (MOC) | 7.0, novembro de 2020 | Visão geral, assinatura, web services, eventos | em vigor |
| MOC, Anexo I | 7.0 | Leiaute e regras de validação | em vigor |
| MOC, Anexo II | 7.0 | DANFE e código de barras | em vigor |
| MOC, Anexo III | 7.0 | Contingência | em vigor (o sistema não emite em contingência) |
| NT 2025.002 (reforma tributária, IBS/CBS/IS) | 1.52, 01/10/2026 | Grupos UB, VB e W03, finalidades de débito e crédito, eventos | obrigatório para o regime normal desde 03/08/2026 (regra UB12-10); Simples e MEI em 04/01/2027 |
| NT 2026.004 (CNPJ alfanumérico) | 1.01, 08/06/2026 | Campos de CNPJ e chave de acesso com letras | 01/07/2026 |
| NT Conjunta 2025.001 (CNPJ alfanumérico) | 1.00, 08/05/2025 | Dígito verificador do CNPJ e da chave, código de barras | junto com a NT 2026.004 |
| NT 2026.010 (DANFE da reforma) | 1.00, 01/10/2026 | Leiaute de impressão com IBS/CBS/IS | 01/12/2026 |
| NT 2026.002 (autorização com alerta, DANFE simplificado tipo 2) | 1.11, 01/10/2026 | cStat 120, regras de referenciamento | 05/10/2026 (parte em 14/12/2026) |
| NT 2026.008 (valor líquido do produto) | 1.00, 01/10/2026 | `vUnComLiq`, `vProdLiq`, `vProdLiqTot`; remove a regra UB16-10 | 03/11/2026 (campos opcionais) |
| NT 2026.009 (CFOP de devolução) | 1.00, 09/09/2026 | Regra I08-140 | 17/09/2026 (o sistema não emite devolução) |
| NT 2026.006 (vinculação com o pagamento) | 1.00, 25/08/2026 | Grupo YC e evento 110300 | 03/11/2026 (opcional) |
| NT 2026.007 (contribuinte exclusivo de IBS/CBS) | 1.10, 01/10/2026 | Emitente sem inscrição estadual | 03/11/2026 (não se aplica a quem tem IE) |
| NT 2026.001 (provedor de assinatura) e NT 2026.003 (DANFE simplificado tipo 2) | 1.02b e 1.00 | Emissão por provedor; impressão simplificada | não usados pelo sistema |
| NT 2025.001 (simplificação operacional) | 1.03, 29/09/2025 | Resposta síncrona obrigatória para lote de uma nota, atraso da data de emissão, `indIEDest`, cobrança e pagamento | 13/10/2025 e 03/11/2025 |
| NT 2019.001 | 1.70, 18/08/2025 | Regra B03-10 (cNF), E16a-40, CST e benefício fiscal | em vigor |
| NT 2018.005 | 1.52, 10/07/2025 | Responsável técnico (`infRespTec`) | só AM, MS, PE, PR, SC e TO exigem |
| NT 2020.006, 2021.004, 2022.005, 2023.004, 2024.003 | últimas versões | Intermediador, CFOP, DIFAL, meios de pagamento, agropecuária | em vigor |

Esquemas: **PL_010f v1.04** (31/08/2026), o pacote mais recente da NF-e 4.00, e **PL_010d v1.03**
(10/07/2026) para evento, consulta e inutilização com CNPJ alfanumérico. Estão em
`tests/fixtures/nfe-xsd/`, com a origem de cada arquivo em `ORIGEM.md`.

Endereços dos web services de São Paulo: conferidos em 10/10/2026 com a relação oficial do portal,
em produção e em homologação (autorização, consulta de protocolo, recepção de evento e
inutilização). São os de `src/lib/fiscal/sefaz.ts` e `src/lib/fiscal/events.ts`.

## 2. Conformidade, regra por regra

### 2.1 Estrutura e esquema

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| PL_010f v1.04 | O XML assinado valida inteiro no XSD, em cada tipo de venda emitido (20 cenários: interna e interestadual, contribuinte e não contribuinte, DIFAL com e sem FCP, importado a 4%, Simples com CSOSN 102 e 400, CRT 2, IPI tributado e não tributado, CST 40, 41 e 50, com e sem transportadora, pessoa física, entrega em outro estado, duas formas de pagamento, forma 99, homologação, CNPJ alfanumérico) | `buildNfeXml`, `signNfeXml` | `tests/nfe-conformidade.test.ts` (esquema PL_010f) | confere |
| PL_010f v1.04 | O arquivo guardado (`nfeProc`) valida no XSD | `nfeProcXml` | idem; `tests/sefaz.test.ts` | confere |
| MOC 7.0, 5.9 e 5.10; PL_010d v1.03 | Evento (cancelamento e carta de correção), consulta e inutilização validam no XSD | `events.ts`, `sefaz.ts` | `tests/nfe-events.test.ts`, `tests/sefaz.test.ts`, `tests/nfe-conformidade.test.ts` (CNPJ alfanumérico) | confere |
| Leiaute | Frete, seguro, desconto e outras despesas destacados (`vFrete`, `vSeg`, `vDesc`, `vOutro`) | sempre `0.00`: o preço do pedido já sai com o desconto, e o frete não é cobrado à parte | — | não emite |
| Leiaute | Devolução, complementar, ajuste, nota de débito e de crédito (`finNFe` 2 a 6) | `finNFe` é sempre 1 | — | não emite |

### 2.2 Reforma tributária (NT 2025.002 v1.52)

| Regra | O que pede | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| UB12-10 (rejeição 1115) | Grupo `IBSCBS` em todo item, para CRT 3, desde 03/08/2026; CRT 1, 2 e 4 em 04/01/2027 | `nfeProblems`: sem CST e `cClassTrib` nas regras fiscais a nota do regime normal não sai | `tests/nfe.test.ts` (Simples) | confere. O CRT 2 (Simples com excesso de sublimite) só é cobrado em 2027, e o sistema já deixa sair sem o grupo |
| UB13-10, UB14-10 a UB14-25 | CST e `cClassTrib` existentes e compatíveis entre si | Formato conferido (3 e 6 dígitos); os códigos são do contador | — | pendente: a tabela de CST × `cClassTrib` (Informe Técnico 2025.002, no portal) não está no sistema; código inexistente só aparece na rejeição da SEFAZ |
| UB16-10 | Base = `vProd` − PIS − COFINS − ICMS − DIFAL − FCP (o IPI não entra) | `figuresOf` (`reformBase`) | `tests/nfe-conformidade.test.ts` (fechamento dos totais) | confere. A regra era "implementação futura" e é removida pela NT 2026.008 em 03/11/2026; a conta segue a LC 214/2025, art. 12 |
| UB18-10, UB37-10, UB56-10 | Em 2026: IBS estadual 0,1%, IBS municipal 0%, CBS 0,9% | Alíquotas das regras fiscais; a migração 0023 semeia esses valores | idem | confere em 2026. **Pendente para 01/01/2027**: as alíquotas mudam (0,05% + 0,05%; CBS da lei) e precisam ser trocadas nas regras fiscais |
| UB35-10, UB54-10, UB54a-10, UB67-10 | Valor de cada item = base × alíquota (tolerância de um centavo); `vIBS` = estadual + municipal | `figuresOf`, `itemXml` | idem | confere |
| W34-10 a W56-10 | Totais do grupo `IBSCBSTot` = soma dos itens | `nfeTotals` | idem | confere |
| VB01-05, W60-05 | `vItem` e `vNFTot` | não são escritos | — | pendente sem prazo: as regras estão como "implementação futura" e os campos são opcionais no PL_010f |
| NT 2026.008 | `vUnComLiq`, `vProdLiq`, `vProdLiqTot` | não são escritos | — | pendente sem prazo: opcionais em 03/11/2026; a obrigação (I11c-10) é "implementação futura" |
| VB01-10, exceção 1 | IBS e CBS de 2025 e 2026 não somam ao total do item nem da nota | `nfeTotals`: `vNF` = produtos + IPI | idem | confere. **Pendente para 2027**: `vProd` passa a conter IBS, CBS e IS |

### 2.3 CNPJ alfanumérico (NT 2026.004 e NT Conjunta 2025.001)

| Regra | Código | Teste | Situação |
| --- | --- | --- | --- |
| Campo CNPJ: `[A-Z0-9]{12}[0-9]{2}`, com dígito verificador pelo valor ASCII menos 48 | `isValidCnpj` (cadastros de cliente, transportadora e empresa) | `tests/cnpj.test.ts`, `tests/db-fiscal.test.ts` | cliente e transportadora: confere. **Emitente: corrigido** (o cadastro apagava as letras; migração 0059) |
| Chave de acesso `[0-9]{6}[A-Z0-9]{12}[0-9]{26}`; dígito com ASCII menos 48 | `accessKeyDigit`, `ACCESS_KEY_PATTERN` | `tests/nfe-conformidade.test.ts` (chave com CNPJ alfanumérico) | corrigido (só aceitava dígitos) |
| Assinatura, evento, consulta e inutilização com chave alfanumérica | `sign.ts`, `events.ts`, `sefaz.ts` | idem (PL_010d v1.03) | corrigido |
| Código de barras do DANFE: Code 128C alternando com o conjunto A nas letras | `code128Symbols` | idem (exemplo `5225AB83` da nota técnica) | corrigido |
| Certificado e-CNPJ com CNPJ alfanumérico | `holderCnpj` | `tests/fiscal-certificate.test.ts` | corrigido no formato; o leiaute do campo no certificado ICP-Brasil para CNPJ com letras não foi conferido em norma do ITI |
| QR Code | não se aplica à NF-e modelo 55 em retrato (a NT 2026.010, item 4.5, anuncia regra futura) | — | — |

### 2.4 Chave de acesso, numeração e série

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| MOC 7.0, Anexo I, B23-10 | Composição (UF, AAMM, CNPJ, modelo, série, número, `tpEmis`, `cNF`) e dígito pelo módulo 11 | `accessKey` | `tests/nfe.test.ts`; conferida com `validar_chave_nfe` do serviço fiscal | confere |
| NT 2019.001, B03-10 (rejeição 897) | `cNF` diferente do número e fora da lista de dígitos repetidos e sequenciais | `isAcceptableRandomCode`, `issueOrderNfe`, `previewOrderNfe` | `tests/nfe-conformidade.test.ts` (cNF), `tests/db-orders.test.ts` | corrigido (só evitava o número igual) |
| Ajuste SINIEF 07/05 | Numeração sequencial, sem repetir em concorrência | `takeNextNumber` (um `UPDATE … RETURNING`); `UNIQUE (environment, series, number)` | `tests/db-orders.test.ts` | confere. O contador é um só para todas as séries: trocar a série continua a numeração da anterior |
| MOC 7.0, Anexo I, 2B08-10, 2B08-30, 2B08-40 e 3B08-100 | Rejeições 205, 206, 218 e 539: o número já é de outra nota na SEFAZ | `NUMBER_TAKEN`; a emissão seguinte usa número novo | `tests/db-orders.test.ts` (resposta perdida) | corrigido (reaproveitava o número e repetia a rejeição para sempre) |
| MOC 7.0, 5.3 | Inutilização de faixa pulada, com justificativa de 15 a 255 letras | `voidInvoiceNumbers` | `tests/sefaz.test.ts`, `tests/db-orders.test.ts` | confere |

### 2.5 Cálculo dos tributos e totais

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| Anexo I, W03-10 a W16-10 | Cada total do grupo W é a soma dos itens; `vNF` = `vProd` + `vIPI` (demais parcelas são zero) | `nfeTotals` | `tests/nfe-conformidade.test.ts` (fechamento dos totais) | confere |
| Anexo I, W13-10 e W14-10 | Total do PIS e da COFINS = soma dos itens | `figuresOf` | idem (cenário CST 06) | corrigido: com CST sem valor (04 a 09) e alíquota preenchida, o total trazia um PIS que nenhum item mostrava |
| Anexo I, I11-10 | `vProd` = `qCom` × `vUnCom` | 4 e 10 casas; o total da linha é que é arredondado | `tests/nfe.test.ts` | confere |
| LC 87/1996, art. 13 | Base do ICMS com o IPI na venda a consumidor final | `ipiInIcmsBase` (regra fiscal da linha) | `tests/nfe.test.ts` | confere |
| EC 87/2015, LC 190/2022, Anexo I NA01-20 e NA01-30 | Grupo `ICMSUFDest` só em venda interestadual a não contribuinte consumidor final, 100% ao destino, base única | `figuresOf`, `itemXml` | `tests/nfe.test.ts`, `tests/nfe-conformidade.test.ts` | confere |
| Anexo I, NA09-10 a NA09-30 (rejeições 697 e 698); Resolução do Senado 13/2012 | `pICMSInter`: 4% para origem importada (1, 2, 3, 8); senão 7% do Sul e Sudeste (menos ES) para os demais estados e 12% nos outros casos | `interstateRate`, `nfeProblems` | `tests/nfe-conformidade.test.ts` (regras de negócio) | corrigido: a nota com DIFAL saía com a alíquota do parâmetro sem conferir a origem do item; agora a divergência é dita antes de enviar. **Pendente**: para contribuinte (sem grupo de DIFAL) a alíquota do parâmetro não é conferida com a origem |
| Anexo I, NA13-10 | FCP do destino em campo próprio (`pFCPUFDest`, `vFCPUFDest`) | `destination.fcp` | idem (cenário RJ) | confere no XML. **Pendente nos dados**: a tabela semeada traz FCP 0% em todos os estados e 22% no RJ (20% + 2% de FCP numa alíquota só) |
| Lei 14.592/2023 (RE 574.706) | ICMS fora da base do PIS e da COFINS | base = valor do produto | — | **pendente** (muda valor de imposto): a base informada inclui o ICMS |
| Lei 12.741/2012 | Valor aproximado dos tributos (`vTotTrib`) na venda a consumidor | não é escrito | — | **pendente**: falta a tabela de carga média (IBPT) |
| LC 123/2006 | Simples: sem destaque de ICMS, sem DIFAL (ADI 5464) | `figuresOf` (`taxed`) | `tests/nfe.test.ts` | confere |
| Tabelas | CST do ICMS aceitos: 00, 40, 41, 50; CSOSN: 102, 103, 300, 400. Redução de base (20), ST (10, 30, 60, 70), diferimento (51) e CSOSN 101, 201, 202, 500, 900 | `nfeProblems` | idem | não emite |

Alíquotas internas dos 27 estados (tabela semeada na migração 0006, editável em Parâmetros)
conferidas uma a uma com `consultar_aliquota_icms` do serviço fiscal: 26 iguais; **Alagoas** está
com 19% no sistema e 20,5% no serviço. A tabela nasceu como provisória ("a confirmar com o
contador") e não foi alterada aqui.

### 2.6 Identificação e regras de negócio

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| Anexo I, E12-30, E12-40, I08-40, I08-50 | `idDest` e CFOP 5/6 pelo estado para onde a mercadoria vai (entrega, quando há) | `destinationUf` | `tests/nfe.test.ts` | confere |
| NT 2019.001, E16a-40 (rejeição 696) | Não contribuinte (`indIEDest` 9) só com `indFinal` 1 | `nfeProblems` | `tests/nfe-conformidade.test.ts` | corrigido (a combinação saía e seria rejeitada) |
| Anexo I, N12-70 (rejeição 508) | Com não contribuinte o CST é 00, 20, 40, 41 ou 60 | `nfeProblems` recusa o 50 | idem | corrigido |
| Anexo I, E17-20, E17-30; NT 2025.001, E16a-30 | `indIEDest` 1 com IE; 9 sem IE; 2 (isento) não é aceito para SP e outros 16 estados | `buildNfeXml`: só 1 e 9 | `tests/nfe.test.ts` | confere; `indIEDest` 2 não é emitido |
| Anexo I, C10-20 (rejeição 273), G07-20 e G07-30 | Município do emitente e da entrega do estado informado | `nfeProblems` | idem | emitente: corrigido; entrega: confere |
| NT 2020.006, B25c-10 | `indIntermed` obrigatório com `indPres` 2, 3, 4 ou 9 | `indPres` 9 e `indIntermed` 0, fixos | `tests/nfe.test.ts` | confere. Venda com retirada na loja sairia como "não presencial": o sistema não distingue |
| Tabela de CST | PIS e COFINS: 01, 02, 04 a 09, 49 a 99; IPI: 00 a 05, 49 a 55, 99 | `nfeProblems` | `tests/nfe-conformidade.test.ts` | corrigido (qualquer par de dígitos passava e a nota caía no esquema da SEFAZ) |
| NT 2025.001, YA03-10 e YA03-20 | Pagamentos somam o total da nota; forma 99 leva descrição | `nfeProblems` | `tests/nfe.test.ts` | confere |
| NT 2025.001, YA04-10 | Grupo `card` para cartão e PIX | não é escrito | — | pendente sem prazo ("implementação futura" para o modelo 55) |
| Anexo I, Y01 a Y09 | Fatura e duplicatas (`cobr`) | não é escrito (grupo opcional) | — | não emite |
| Anexo I, X02-20, X07-10 | Sem veículo em operação interestadual; IE da transportadora com UF | `transportXml`, `nfeProblems` | `tests/nfe.test.ts` | confere |
| NT 2018.005, ZD01-10 | `infRespTec` | não é escrito | — | confere para SP (não exige). Vira pendência ao emitir por AM, MS, PE, PR, SC ou TO |
| Leiaute, campo `email` (até 60) | Não cortar o endereço | `buildNfeXml` | `tests/nfe-conformidade.test.ts` | corrigido (cortava em 60 letras; agora fica de fora) |
| Leiaute, `dhEmi` | Fuso do emitente | sempre `-03:00` | — | confere para SP; pendência ao emitir por estado de outro fuso |

CFOP, CST e CSOSN usados nos testes foram conferidos com `consultar_cfop` e `validar_cst` do
serviço fiscal (todos válidos). NCM e CEST não puderam ser conferidos: a base do serviço está
incompleta (`95069100` e `2806400` não constam).

### 2.7 Assinatura e transmissão

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| MOC 7.0, 4.2 | XMLDSig enveloped, C14N 1.0, SHA-1, RSA-SHA1, `X509Certificate` só do titular | `sign.ts` | `tests/nfe-sign.test.ts` (conferida com `xml-crypto`) | confere |
| MOC 7.0, 4.2 | Certificado ICP-Brasil A1 em vigor, do CNPJ da empresa | `saveCertificate`, `issueOrderNfe` | `tests/db-fiscal.test.ts` | confere na validade e no CNPJ. A cadeia do certificado da empresa não é validada localmente: quem a valida é a SEFAZ (rejeições 280 a 298) |
| MOC 7.0, 4.2 | TLS 1.2 ou mais, com o certificado da empresa; servidor conferido contra a raiz da ICP-Brasil | `transmit`, `sendToSefaz` | `tests/sefaz.test.ts` | confere. Em 10/10/2026 a cadeia dos dois servidores de SP (AC SOLUTI SSL EV G4 → Raiz v10) validou contra a raiz embutida |
| NT 2025.001, GAP03a-3 (rejeição 452) | Lote de uma nota tem de pedir resposta síncrona | `authorizationEnvelope` (`indSinc` 1) | `tests/sefaz.test.ts` | confere |
| MOC 7.0, 5.1 | cStat 100 e 150 autorizam; 110, 301, 302, 303 denegam | `parseAuthorization` | idem | confere |
| NT 2026.002, 2.1 | cStat 120: autorizada com alerta | `AUTHORIZED` | `tests/nfe-conformidade.test.ts` | corrigido por prevenção: hoje só a NFC-e recebe 120; se viesse, a nota autorizada seria gravada como rejeitada |
| Anexo I, 2B08-20 (rejeição 204) | Duplicidade: a nota já está na SEFAZ | `issueOrderNfe` consulta a chave: autorizada, grava o protocolo; não encontrada, a nota fica aguardando e nada é emitido de novo | `tests/db-orders.test.ts` (resposta perdida) | corrigido (era gravada como rejeitada, com orientação de emitir de novo). Ressalva: se o número for mesmo de outra nota e a SEFAZ responder 204 em vez de 539, a saída é manual (a tela não tem como descartar a nota que aguarda) |
| Anexo I, B03 e B04 (108, 109) | Serviço parado: reenviar a mesma nota depois | `parseAuthorization` ("sem-resposta") | `tests/sefaz.test.ts` | confere |
| Anexo I, 4.3 (rejeição 656) | Consumo indevido: parar e esperar | `NOT_A_VERDICT` | `tests/nfe-conformidade.test.ts` | corrigido (era gravada como rejeição da nota, o que levava a nova emissão e a mais consumo) |
| MOC 7.0, 5.4 | Nota enviada sem resposta: consultar antes de reenviar | `issueOrderNfe` (`consSitNFe`) | `tests/db-orders.test.ts` | confere. Resposta 103 (lote em processamento) é resolvida pela consulta da chave, não pelo recibo |
| MOC 7.0, 6.3 | `nfeProc` = nota assinada + protocolo | `nfeProcXml` | `tests/sefaz.test.ts` | confere |
| Portal, relação de web services | Endereços de SP | `sefaz.ts`, `events.ts` | `tests/sefaz.test.ts` | confere (10/10/2026). Outros estados: não configurados, por decisão ("só o que foi conferido") |
| MOC 7.0, Anexo III | Contingência (SVC-AN, SVC-RS, EPEC, FS-DA) | `tpEmis` é sempre 1 | — | **não emite**: com a SEFAZ-SP fora do ar, a nota espera |

### 2.8 Eventos

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| MOC 7.0, 5.9 (regra 2P12-14); Ajuste SINIEF 07/05, cláusula 12ª | Cancelamento com `nProt` e justificativa de 15 a 255 letras, em até 24 horas | `eventXml`; o prazo é conferido pela SEFAZ (501, ou 155 fora do prazo) | `tests/nfe-events.test.ts`, `tests/db-orders.test.ts` | confere. O sistema não avisa antes que o prazo passou |
| MOC 7.0, 5.10 | Carta de correção: 15 a 1.000 letras, sequência de 1 a 20, texto das condições de uso | `eventXml`, `countCorrections` | idem | confere. O limite do que pode ser corrigido (valor, destinatário, data) está no texto obrigatório; o conteúdo digitado não é analisado |
| Anexo I (rejeição 573) | Evento duplicado: já registrado em chamada sem resposta | `registerOrderNfeEvent` consulta a nota e grava o evento que a SEFAZ tem | `tests/db-orders.test.ts` (resposta perdida), `tests/nfe-conformidade.test.ts` (`consultEvents`) | corrigido: o cancelamento feito e não confirmado deixava a nota "autorizada" no sistema para sempre, e a carta de correção travava na mesma sequência |
| MOC 7.0, 7.4 | Guardar o XML do evento | `fiscal_invoice_events.signed_xml` | `tests/db-orders.test.ts` | confere com ressalva: guarda o evento assinado, sem o `retEvento` (o protocolo fica em coluna). O `procEventoNFe` completo só é guardado quando vem da consulta |
| MOC 7.0, 5.3 | Inutilização | `voidInvoiceNumbers`; XML assinado em `fiscal_number_voids` | idem | confere |

### 2.9 DANFE

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| MOC 7.0, Anexo II, 3.1 e 3.8 | Todos os campos do modelo, preenchidos só com o que o XML traz | `renderDanfe` | `tests/nfe-conformidade.test.ts` (DANFE) | corrigido: faltavam IE do substituto tributário, data e hora da saída, código ANTT, placa e UF do veículo, marca e numeração dos volumes e o quadro "Reservado ao fisco"; e o tipo (entrada ou saída) era fixo em vez de lido do XML |
| Anexo II, 3.3 | Canhoto, fatura/duplicatas e cálculo do ISSQN podem ser suprimidos | não são desenhados | — | confere |
| Anexo II, 3.1.3 | Emitente com endereço completo e telefone | `header` | `tests/danfe.test.ts` | pendente: o cadastro fiscal da empresa não tem telefone, e a nota sai sem `fone` |
| Anexo II, 2 | Chave em Code 128C, 11 blocos de 4, altura mínima de 0,8 cm, módulo de 0,02 cm, margem clara | `code128Widths`; barras de 1,06 cm, módulo de 0,028 cm | `tests/barcode.test.ts` (igual ao `jsbarcode`) | confere |
| Anexo II, 3 | "SEM VALOR FISCAL" em homologação e sem protocolo | `stamp`, dados adicionais | `tests/danfe.test.ts` | confere |
| NT 2026.010 | Leiaute da reforma a partir de 01/12/2026: regime tributário, total do IBS/CBS/IS, tributos por item, alíquota efetiva quando há redução | `renderDanfe({ reform })`, data em Parâmetros → Fiscal | `tests/danfe.test.ts` | confere |
| Anexo II, 3.9; Anexo III | DANFE de contingência | — | — | não emite |

Comparado com o DANFE de `gerar_danfe` do serviço fiscal, a partir do mesmo XML (venda
interestadual a não contribuinte, com IPI, DIFAL e transportadora): chave, número, série,
protocolo, emitente, destinatário, totais, transporte, itens e dados adicionais são iguais.
Diferenças de conteúdo: o do serviço imprime o canhoto e o campo "valor aproximado dos tributos"
(vazio) e mostra quantidade e preço unitário com 4 casas; o do ERP imprime a linha do DIFAL e do
IBS/CBS nos dados adicionais (leiaute atual) e tem o leiaute da NT 2026.010, que o serviço não tem.

### 2.10 Guarda e segurança

| Norma | Regra | Código | Teste | Situação |
| --- | --- | --- | --- | --- |
| Ajuste SINIEF 07/05, cláusula 10ª; CTN, art. 173 | Guardar o XML autorizado pelo prazo decadencial (cinco anos, mais o ano corrente) | `fiscal_invoices.authorized_xml`; nenhuma rotina apaga; pedido com nota não se exclui; backup diário com cópia fora do servidor (`docs/operacao.md`) | `tests/db-orders.test.ts` | confere. Não há rotina que confira, ano a ano, se os arquivos antigos continuam legíveis |
| — | Certificado e senha nunca saem do servidor | Selados com AES-256-GCM (`ERP_CERT_KEY`); a tela recebe só titular, validade e resumo; o log leva só a mensagem do erro | `tests/fiscal-certificate.test.ts`, `tests/db-fiscal.test.ts`, `tests/routes.test.ts` | confere |
| — | Só quem tem a permissão de parâmetros emite, cancela e corrige | `requirePermission("parametros")` | `tests/routes.test.ts` | confere |
| — | Produção protegida de emissão acidental | O ambiente nasce em homologação; a troca é um campo de Parâmetros → Fiscal; a numeração e as notas de cada ambiente são separadas | `tests/db-fiscal.test.ts` | confere com ressalva: a troca para produção não pede confirmação nem deixa aviso na tela do pedido além do nome do ambiente |

## 3. Pendências, por gravidade

Não foram corrigidas porque mudam valor de imposto, dependem de dado que o sistema não tem ou são
operações que ele não faz.

1. **Base do PIS e da COFINS com o ICMS dentro** (Lei 14.592/2023). A nota informa base e valor
   maiores que os devidos no regime normal. Corrigir muda o valor das contribuições de toda nota e
   a base do IBS/CBS; decisão do contador antes do código.
2. **Sem contingência** (MOC, Anexo III). SEFAZ-SP parada, nenhuma nota sai. Falta SVC-AN (os
   endereços, `tpEmis` 6, `dhCont` e `xJust`) ou EPEC.
3. **`vTotTrib` ausente** (Lei 12.741/2012), exigido na venda a consumidor final. Precisa da tabela
   do IBPT por NCM.
4. **Alíquotas de 2027 do IBS e da CBS** e a nova composição de `vProd` (NT 2025.002 e NT 2026.008):
   trocar até 31/12/2026.
5. **Tabela de CST × `cClassTrib`** fora do sistema: código errado só aparece na rejeição.
6. **ICMS interestadual × origem para contribuinte**: sem o grupo de DIFAL a SEFAZ não confere, e o
   sistema também não; mercadoria importada (4%) com parâmetro de 7% ou 12% destaca ICMS a mais.
7. **Dados semeados**: Alagoas com 19% (o serviço fiscal traz 20,5%); FCP 0% em todos os estados.
8. **Telefone do emitente** no cadastro fiscal (campo mínimo do DANFE).
9. **Evento guardado sem o `retEvento`**; `card`, `cobr`, `vItem`, `vNFTot`, `vProdLiq`: opcionais
   ou com regra futura.
10. **Só São Paulo**: outros estados pedem endereços, fuso de `dhEmi` e, em seis deles,
    `infRespTec`.

## 4. O que só se prova com certificado e SEFAZ de verdade

Nada disto foi executado: nenhuma transmissão foi feita nesta auditoria.

- Autorização em homologação de cada cenário da seção 2.1: as regras de validação da SEFAZ
  (cadastro do emitente e do destinatário, NCM, CFOP, `cClassTrib`) só existem lá.
- A assinatura com um A1 da ICP-Brasil (os testes usam certificado autoassinado) e a aceitação da
  cadeia pela SEFAZ.
- Cancelamento, carta de correção e inutilização de ponta a ponta, e se a consulta de protocolo de
  SP devolve os `procEventoNFe` como o MOC descreve (é disso que depende a recuperação do evento
  duplicado).
- O comportamento real nas respostas 103, 108, 109, 204, 539 e 656.
- Leitura do código de barras do DANFE impresso por um leitor.

## 5. Conferências com o serviço fiscal (10/10/2026)

Feitas à mão com o MCP Fiscal (`fiscal.avilaops.com/mcp`), sobre XML gerado pelos construtores do
ERP; não fazem parte da suíte.

| Ferramenta | Resultado |
| --- | --- |
| `validar_chave_nfe` | Chave válida; UF, mês, CNPJ, modelo, série e número lidos iguais |
| `parse_nfe_xml` | Emitente, destinatário, itens, CFOP, ICMS, totais, base do IBS/CBS e protocolo lidos iguais nos três cenários (interestadual com DIFAL, interna a contribuinte, Simples) |
| `validar_assinatura_nfe` | **Não validou**: o serviço recusa RSA-SHA1 por configuração ("Signature method RSA_SHA1 forbidden"), que é o algoritmo que o MOC exige. Titular, CNPJ e validade do certificado foram lidos certos. A assinatura segue conferida pelo `xml-crypto` nos testes |
| `gerar_danfe` | Ver 2.9 |
| `consultar_aliquota_icms` | Ver 2.5 |
| `consultar_cfop`, `validar_cst` | Códigos válidos. O serviço descreve o CFOP 6108 como "venda destinada a exportação"; a tabela oficial diz "venda de mercadoria de terceiros a não contribuinte" |
| `consultar_ncm`, `consultar_cest` | Base incompleta no serviço: não conferido |

### 5.1 `validar_xml_fiscal` e `validar_chave_dfe` (entraram no serviço em 10/10/2026)

O serviço fiscal ganhou no mesmo dia duas ferramentas. `validar_xml_fiscal` (entrada
`{ xml_content, tipo: "nfe" }`) confere o XML contra o pacote PL_010f de 31/08/2026 (NT 2025.002
v1.50 e NT 2026.007 v1.00), inclusive o detalhe dos eventos, que o esquema principal não confere,
e a chave do atributo `Id` contra os campos do XML; não aplica regra de negócio nem confere a
assinatura. `validar_chave_dfe` confere a chave de acesso e aceita CNPJ alfanumérico.

Os 33 XML que `tests/nfe-conformidade.test.ts` monta foram passados à mão por `validar_xml_fiscal`:

| XML | Resultado |
| --- | --- |
| NF-e assinada dos 20 cenários de venda (2.1), inclusive o de CNPJ alfanumérico no emitente, no destinatário, na entrega e na transportadora | 20 válidos, sem erro; chave do `Id` conferida com os campos |
| `nfeProc` (cenário interestadual com DIFAL e FCP) | válido |
| Evento de cancelamento e carta de correção, sozinhos e no lote (`envEvento`), com CNPJ numérico | 4 válidos, com o detalhe do evento conferido |
| Inutilização e consulta de situação, com CNPJ numérico | 2 válidos |
| Consulta de situação com chave alfanumérica | válida |
| Evento de cancelamento e carta de correção (sozinhos e no lote) e inutilização, com **CNPJ alfanumérico** | **5 recusados pelo serviço**, por padrão só de dígitos: nos eventos, `Id`, `CNPJ` e `chNFe`; na inutilização, só o `Id` |

As cinco recusas são do conjunto de esquemas do serviço, não do XML: para evento e inutilização
ele usa os pacotes anteriores ao CNPJ alfanumérico (cancelamento de 21/12/2018, carta de correção
de 30/05/2014 e a inutilização do pacote 9), que só aceitam dígitos. Os mesmos cinco XML validam
no pacote oficial PL_010d v1.03 de 10/07/2026 (NT 2026.004), que é o que a suíte usa
(`tests/nfe-conformidade.test.ts`, "CNPJ alfanumérico nos outros pedidos"). Nada foi alterado no
ERP por causa delas; falta o serviço fiscal adotar o PL_010d para evento e inutilização.

`validar_chave_dfe` confirmou a chave alfanumérica dos testes
(`35261012ABC34501DE35550010000001231482917364`): válida, dígito verificador 4, emitente
`12ABC34501DE35`. É a conferência independente do cálculo de `accessKeyDigit` com letras.

## 6. Como repetir

Os testes rodam com a suíte (`npm test`). Para trocar de pacote de esquemas, baixar o ZIP do
portal, substituir os arquivos de `tests/fixtures/nfe-xsd/`, atualizar o `ORIGEM.md` e rodar
`tests/nfe-conformidade.test.ts`: o que o novo esquema recusar aparece com o nome do cenário.
