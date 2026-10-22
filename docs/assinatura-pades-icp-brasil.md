# Assinatura ICP-Brasil PAdES dos contratos

O contrato assinado pelo cliente só é concluído depois que o PDF passa pelo assinador
PAdES AD-RB e pela conferência deste ERP. Se a assinatura ou a conferência falha, o
contrato continua aguardando, o código não é gasto e nenhum evento `assinado` é gravado.
A pessoa vê o motivo e pode tentar de novo.

Baixar o PDF depois não assina de novo: devolve o arquivo gravado na mesma transação
da conclusão. Contrato antigo, assinado antes desta coluna, não é entregue sem selo.

## De onde saem OID e hash

Nada é digitado à mão. `src/lib/contract/icp/lpa.ts` lê os DER versionados ao lado dele.

| Artefato | Fonte |
| --- | --- |
| LPA PAdES | http://politicas.icpbrasil.gov.br/LPA_PAdES.der |
| Página da LPA | https://www.gov.br/iti/pt-br/assuntos/repositorio/lista-de-politicas-de-assinatura |
| PA AD-RB v1.3 | http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der |
| Página da PA | https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb |
| Resumo SHA-256 da PA | http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3der-sha256.txt |
| Resumo SHA-256 da LPA | http://politicas.icpbrasil.gov.br/LPA_PAdES_der-sha256.txt |

Baixados em 2026-10-22. O hash do arquivo da PA confere com o resumo e com o hash
que a LPA publica para essa PA. O hash que vai em `sigPolicyId` é o outro: o
OCTET STRING final do DER da PA. É o que a nota 2 do DOC-ICP-15.03 manda, não o
hash do arquivo.

A PA AD-RB v1.3 traz, entre outros:

- OID `2.16.76.1.7.1.11.1.3`
- algoritmo de hash SHA-256 (`2.16.840.1.101.3.4.2.1`)
- atributos obrigatórios: content-type, message-digest, signingCertificateV2, sigPolicyId
- Filter `PBAD_PAdES` e SubFilter `PBAD.PAdES`
- texto de que este perfil não usa carimbo do tempo

OIDs que a PA não lista, e que o código cita pela norma:

- `id-signingTime` `1.2.840.113549.1.9.5` — RFC 5652, seção 11.3. Proibido no CMS (DOC-ICP-15.03, tabela A.14, ND). A data `/M` do dicionário PDF não é esse atributo.
- `id-aa-signatureTimeStampToken` `1.2.840.113549.1.9.16.2.14` — RFC 3161 / RFC 5126. A PA AD-RB vigente diz que carimbo não é usado. Presença dele é incompatível com este perfil. AD-RT seria outra política.
- `id-spq-ets-uri` `1.2.840.113549.1.9.16.5.1` — RFC 5126. Um qualificador, com a URI da PA (DOC-ICP-15.03, nota 1).
- `id-data` e `id-signedData` — RFC 5652.

CRL e OCSP não vão no CMS (tabela A.15, ND para PAdES). Vão no dicionário DSS, num
incremento depois do ByteRange (tabelas A.19, A.20 e A.22; ETSI EN 319 142). O perfil
AD-RB permite DSS. Este ERP exige os dois, cadeia completa e VRI. É mais estrito que
o mínimo da PA.

## Assinador

O CMS é montado com PKIjs 3.3.3 (SignedData, RFC 5652), não com o PKCS#7 do
node-forge. O node-forge continua na nota fiscal e na leitura do PFX. Quem assina
o contrato é o processo `scripts/pades-signer.ts`.

O ERP manda `POST /assinar` com perfil, tenant, impressão SHA-256 do certificado,
PDF, motivo e data. Não manda PFX, senha nem chave. O assinador só acha a chave
se o par (tenant, impressão) for o dele. HTTPS com token no cabeçalho. A CA
privada, quando houver, entra em `ERP_PADES_TLS_CA`.

A resposta é conferida de novo neste processo: atributos da PA, política, hash
interno, ausência de signingTime e de carimbo, cadeia, DSS, CRL/OCSP, ByteRange
e `openssl cms -verify`. O `-noverify` desliga só a confiança da cadeia. Não é
o VALIDAR/ITI.

## O que ainda não é o VALIDAR

OpenSSL e o preflight não substituem o validador oficial do ITI. Falta submeter
um PDF assinado com certificado ICP-Brasil real. Isso depende de autorização
para usar esse certificado. Até lá, o contrato não deve ser tratado como
validado pelo ITI.
