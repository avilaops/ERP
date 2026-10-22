# Onde roda o assinador PAdES

Proposta. Não há deploy neste documento. Nenhum serviço foi publicado.

## Decisão sobre o DSS da Comissão Europeia

O DSS (https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/Digital+Signature+Service+-+DSS)
é um assinador Java maduro, da Comissão Europeia, para CAdES/PAdES/XAdES no
perfil ETSI. Foi avaliado como serviço separado e **não entra nesta entrega**.

Motivo: o PDF que o VALIDAR/ITI espera neste perfil usa Filter `PBAD_PAdES` e
SubFilter `PBAD.PAdES`, com DSS/VRI como o DOC-ICP-15.03 descreve nas tabelas
A.18 a A.22. O DSS da Comissão, na configuração de fábrica, emite PAdES
baseline com `ETSI.CAdES.detached`. Forçar o subfiltro da ICP-Brasil seria um
serviço Java novo. Este repositório não ganha outro projeto, e o CI não tem
Java.

O assinador desta entrega é um processo Node no mesmo repositório
(`scripts/pades-signer.ts`), com PKIjs para o CMS (RFC 5652) e os DER oficiais
da LPA/PA. O DSS europeu só volta a ser candidato depois de um ensaio no
VALIDAR, com certificado real autorizado, mostrar que um subfiltro customizado
passa. Esse ensaio não foi feito.

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
