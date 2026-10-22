# Onde roda o assinador PAdES

Proposta. Não há deploy neste documento. Nenhum serviço foi publicado.

## Decisão sobre o DSS da Comissão Europeia

O DSS (https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/Digital+Signature+Service+-+DSS)
é um assinador Java da Comissão Europeia. O código abaixo foi lido no
`master` de https://github.com/esig/dss em 2026-10-22.

Ele consegue o perfil pedido, com a API pública, sem alterar o projeto:

- `PAdESSignatureParameters.setFilter` e `setSubFilter` são `String`. O padrão
  é Filter `Adobe.PPKLite` e SubFilter `ETSI.CAdES.detached`. O mesmo
  `setSubFilter` que aceita `adbe.pkcs7.detached` aceita `PBAD.PAdES`.
  `setFilter("PBAD_PAdES")` troca o Filter. Fonte:
  `dss-pades/.../PAdESSignatureParameters.java`.
- O CMS não muda de construtor por causa do SubFilter.
  `CMSForPAdESBuilderHelper.initCAdESProfile` devolve sempre
  `PAdESLevelBaselineB`. `isCAdESDetached` só decide se o PDF ganha a extensão
  de desenvolvedor ESIC. `PBAD.PAdES` não entra em `hasPKCS7SubFilter`, que
  compara só com `adbe.pkcs7.detached` e `adbe.pkcs7.sha1`.
- `PAdESLevelBaselineB.addSigningTimeAttribute` está vazio, com o comentário
  da ETSI TS 102 778-3, cláusula 4.5.3. O CMS do nível B não leva
  `signingTime`. A data vai para a entrada `/M` do dicionário PDF.
- Com SHA-256, `CAdESUtils.addSigningCertificateAttribute` grava
  `id-aa-signingCertificateV2`. O algoritmo dentro do `ESSCertIDv2` fica
  ausente: no DSS, SHA-256 é o default do RFC 5035. Com SHA-1 o atributo
  seria o v1, que este perfil não usa.
- `CAdESLevelBaselineB.addSignaturePolicyId` grava `id-aa-ets-sigPolicyId`
  com o OID, o algoritmo, o hash que o chamador passou e, se houver
  `Policy.setSpuri`, um qualificador `id-spq-ets-uri`. O DSS não calcula o
  hash interno da PA. Quem chama passa os bytes do OCTET STRING final da PA
  (DOC-ICP-15.03, nota 2), não o hash do arquivo.

O nível `PAdES_BASELINE_LT` não serve para a PA AD-RB vigente.
`PAdESLevelBaselineLT` estende `PAdESLevelBaselineT` e, ao subir o nível,
embute `signature-time-stamp`. A PA AD-RB diz que carimbo não é usado, e este
ERP recusa esse atributo. CRL e OCSP sem carimbo saem de outra chamada, já
pública: `PDFSignatureService.addDssDictionary` sobre o PDF do nível B, com
`setIncludeVRIDictionary(true)`. O padrão do VRI no DSS é falso.

Esta entrega continua no PKIjs (`scripts/pades-signer.ts`). O motivo não é
SubFilter travado. É que usar o DSS aqui seria um processo Java novo, com
PDFBox, num CI que só tem Node. Isso não foi feito, e nenhum PDF do DSS foi
levado ao VALIDAR/ITI.

## Onde

| Máquina | Por que não, ou por que sim |
| --- | --- |
| `applications` | Já roda o ERP, o banco e o site. A chave de assinatura não fica no mesmo container do ERP. |
| `orchestrator` | Plano de controle. Não assina PDF de cliente. |
| `apps-noclient` | É aqui. Já hospedou o ERP e hoje não tem esse processo. O assinador escuta só na rede privada. O ERP, em `applications`, chama por HTTPS. |

Nada disso foi instalado. A instalação antiga do ERP nessa máquina não é reativada.

## Como os processos se falam

- TLS. O ERP recusa URL que não seja `https` e recusa usuário ou senha na URL.
- Token no cabeçalho `Authorization`. Comparado em tempo constante. O valor fica em cofre ou em `ERP_PADES_SIGNER_TOKEN`, nunca no Git.
- CA privada opcional em `ERP_PADES_TLS_CA`. Sem ela, a conferência usa as CAs públicas do sistema.
- mTLS no proxy da rede privada é o endurecimento preferível na hora de publicar. O código desta entrega autentica com token sobre TLS. Não publica os dois ao mesmo tempo sem o proxy.

## Chaves

Diretório montado só para leitura, um subdiretório por empresa (`ERP_PADES_KEY_DIR/<tenant>/`):

- `cert.pem` — certificado do signatário
- `chain.pem` — intermediárias e raiz
- `key.pem` — chave privada
- `crl.der` e `ocsp.der` — revogação que entra no DSS

O nome do diretório é o slug da empresa. A busca é slug mais a impressão SHA-256
do certificado. A chave de uma não assina PDF de outra.

Senha de chave cifrada: `ERP_PADES_KEY_PASSWORD`, só no ambiente. Não entra em
log, em resposta nem no Git. PFX não atravessa a API.

O ERP continua guardando o A1 cifrado no banco, para a nota fiscal. O contrato
não abre esse PFX. Abre só a impressão, o nome e o prazo. Se o certificado
vence em 30 dias ou menos, o processo escreve um aviso com a impressão e a
data, sem a chave.

## Saúde, prazo, log, monitoramento, volta atrás

- `GET /health` responde `{"status":"ok"}`. Não leva token, nome de empresa nem caminho de chave.
- O pedido de assinatura corta em 15 s no assinador. O ERP espera `ERP_PADES_SIGNER_TIMEOUT_MS` (padrão 20 s, entre 100 ms e 60 s).
- Log: `assinatura tenant=… certificado=… resultado=…`. Resultado é uma palavra (`assinado`, `recusado-tenant`, `recusado-revogado`, `falha`). Não entra PDF, token, PEM, senha nem corpo do pedido.
- Monitorar: o health, a taxa de `falha` e de `recusado-revogado`, e o prazo do certificado (o aviso dos 30 dias). Alerta se o health cair ou se o certificado estiver a menos de 30 dias do fim.
- Volta atrás: parar o container do assinador. O ERP passa a recusar a conclusão e não grava contrato assinado. PDF já selado continua no banco. Não se apaga contrato selado para "desfazer". A imagem do ERP volta junto com a do assinador, senão um ERP novo fala com um assinador velho.

## Imagem

`deploy/pades-signer/Dockerfile` e `deploy/pades-signer/compose.yaml`.
A imagem não contém chave. O compose publica a porta só em `127.0.0.1` do
anfitrião e monta TLS e chaves só para leitura. Não foi executado contra
servidor nenhum.
