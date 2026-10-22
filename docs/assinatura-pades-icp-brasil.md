# Assinatura ICP-Brasil PAdES — contrato de integração

O gerador legado em `src/lib/contract/seal.ts` **não é usado** pelo fluxo de contratos assinados na branch deste PR. Ele não atende aos atributos exigidos pela política PAdES ICP-Brasil.

## Serviço assinador necessário

Provisionar um serviço de assinatura PAdES compatível com DOC-ICP-15.02 e DOC-ICP-15.03, em ambiente confiável com cofre/HSM e certificado A1 da empresa. Não enviar PFX, senha ou chave privada pela API. O serviço deve usar certificado associado à impressão SHA-256 fornecida, validar sua titularidade e permissões e responder apenas com PDF assinado.

Variáveis no backend ERP:
- `ERP_PADES_SIGNER_URL`: endpoint HTTPS do serviço interno.
- `ERP_PADES_SIGNER_TOKEN`: segredo de autenticação mantido em cofre (não no Git).

POST JSON: `{profile:"ICP-BRASIL-PADES-AD-RB", certificateSha256, pdfBase64, reason, signedAt}`.
Resposta JSON: `{signedPdfBase64}`.

A API do ERP verifica a presença dos atributos assinados exigidos, a ausência de `signingTime` e a presença do certificado esperado no CMS. **Isso é somente preflight estrutural**: ainda é necessária validação criptográfica independente da assinatura, cadeia ICP-Brasil, revogação, política/hash e resultado do VALIDAR/ITI.

## Bloqueios para produção

1. Implantar o serviço assinador confiável, política PAdES vigente e cadeia correta, com validação criptográfica independente.
2. Adequar testes existentes para certificado A1 obrigatório e testar rejeição de assinaturas não conformes.
3. Verificar geração de novo contrato em homologação, baixar PDF final e submetê-lo ao VALIDAR/ITI.
4. Registrar relatório de conformidade aprovado. Não tratar PDF como validado antes disso.
5. Não publicar a branch enquanto o serviço não estiver provisionado: sem ele a assinatura é bloqueada de propósito.

A assinatura eletrônica do cliente por e-mail/SMS é distinta da assinatura qualificada da empresa.
