# DOCUMENTOS: execução e evidências de 17/10/2026

Demanda: [AVL-147](https://linear.app/avilaops/issue/AVL-147). Implementação local e validação em `erp_documents_test`; sem publicação do ERP, migration de produção ou alteração dos quatro workflows existentes.

## Implementado

- Migrations 0066/0067: coleções, fontes, documentos, versões, trechos, catálogo XML, links, fila, leases e tentativas, com índices por nome/namespace e FTS. Permissões por empresa e coleção; originais por SHA-256 e derivados separados.
- Biblioteca `/documentos`, filtros em três etapas, leitura por trecho, fonte, histórico, campos XML e controle de coletas. Download autenticado verifica o hash antes de servir o original como anexo.
- Worker limitado e incremental, com deduplicação, DNS fixado/TLS/allowlist, redirects, ETag, retomada e gravação em lotes. SQL externo permanece documental; nenhum script baixado foi executado.
- PDF por página e OCR português, ZIP com orçamento acumulado, XML/XSD/WSDL sem entidades externas, texto/SQL, DOCX, XLS/XLSX e metadados de certificados públicos. DOC legado depende de `antiword`, previsto na imagem do worker.
- Compose e Dockerfile preparados; imagem Docker ainda não construída/testada. Runbook em [documentos.md](documentos.md).

## Acervo real

As quatro raízes NF-e fornecidas foram acessadas e classificadas. O retrato está em [manifest.json](evidencias/documentos/manifest.json) e [manifest.csv](evidencias/documentos/manifest.csv).

| Medida | Resultado |
| --- | ---: |
| Jobs indexados | 288 |
| Jobs parciais | 12 |
| Jobs falhos | 6 |
| Pendentes / em execução no encerramento da coleta | 0 / 0 |
| Referências internas de ZIP do extrator anterior, bloqueadas para auditoria | 69 |
| URLs excluídas com justificativa | 58 |
| Documentos catalogados | 305 |
| Versões preservadas | 306 |
| Trechos pesquisáveis | 11.364 |
| Elementos XML catalogados | 141.730 |
| Hashes distintos nas versões | 294 |

Contagens são de entidades diferentes; não devem ser somadas como documentos únicos. Os 69 registros bloqueados são referências relativas de XSD inicialmente interpretadas como URLs do portal, e não bloqueios HTTP confirmados. O extrator foi corrigido para relacionar essas dependências dentro do ZIP. Registros antigos foram preservados com motivo explícito.

Um pacote de três arquivos DOC antigos não teve texto extraído no Windows sem `antiword`. As outras cinco falhas correspondem a materiais de software sem texto documental ou acima do limite de download de 32 MB. Parciais incluem arquivos auxiliares dos pacotes, divergências de encoding e formatos que exigem revisão. Falhas não foram convertidas em sucesso. Versões falhas históricas podem continuar no manifesto mesmo após uma coleta posterior indexada.

Não há afirmação de download/indexação de 100% do domínio. O escopo é o conjunto descoberto a partir das quatro raízes, com profundidade e limites publicados. Instalação de software, execução de anexos e configuração tributária automática não fazem parte da ingestão.

## Workflows e armazenamento

O inventário sanitizado está em [documentos-workflows-auditoria.json](documentos-workflows-auditoria.json).

| Workflow | Resultado da inspeção |
| --- | --- |
| `n6lfkOJHwYCucr05` | NOTAS: chama atualização de documento no Outline. Não é coletor NF-e; não foi executado. Último erro consultado: texto procurado não encontrado. |
| `eUYxjZQjnSFAzgiu` | Controlador OpenAI inativo. Execuções consultadas terminaram em `crashed`; mensagem cita possível falta de memória, sem causa raiz confirmada. |
| `X3GNKFEce7M8LWBk` | Worker OpenAI ativo; draft difere da versão publicada. Data Tables de conteúdo e progresso, com texto/HTML e URLs de mídia; não comprovam download dos arquivos de mídia. |
| `pjPx9JqspcXObd5w` | Brave inativo, acionamento manual, cinco registros na tabela consultada e sem checkpoint dedicado nos nós examinados. |

O banco físico é PostgreSQL `n8n`, schema `public`, com tabelas `data_table_user_*`. Foram confirmadas as tabelas de conteúdo `NMK4BkflBWKhtqGU` (859 linhas), progresso `YZUCih7eGR1Ryyyp` (uma linha) e Brave `1FGJBkGYWD3BMnHh` (cinco linhas). A amostra de texto incompleto não foi generalizada às 859 linhas. Nenhuma tabela interna do n8n foi alterada ou migrada para a coleção fiscal.

Novo [workflow de supervisão](https://n8n.avilaops.com/workflow/qWaAmsIZTR4NZZbl): criado, validado e testado com dados fixados; continua inativo e sem credencial ERP atribuída. O teste não comprova requisição autenticada real. Código SDK em [documentos-n8n.workflow.txt](documentos-n8n.workflow.txt).

## Verificações

- 40 testes de funções, rotas, permissões e navegação passaram sem pulos.
- Dois testes de PostgreSQL verificam seeds idempotentes, concorrência, leases, recuperação, acesso privado, isolamento entre schemas, FTS, campo/namespace exatos, cursor, versão e datas.
- Nove testes do extrator passaram, incluindo OCR real em português, ZIP aninhado, dependências internas e planilha com formatação fora da área de dados.
- 45 medições de nove destinos/etapas nos cinco tamanhos passaram: sem overflow horizontal, dentro da altura normal e controles de pelo menos 44 px. [Medições](evidencias/documentos/medidas.json).
- Teste adicional passou: anônimo recebe 401, original coincide com SHA-256, download é anexo, navegação por teclado e texto ampliado a 200% funcionam.
- Lint, tipos e build foram executados; resultados finais e performance ficam registrados na tarefa Linear e nos artefatos desta pasta.

## Performance de busca

[Benchmark reproduzível](evidencias/documentos/benchmark.json): 10.000 documentos, 10.000 trechos e 100 elementos XML sintéticos, PostgreSQL 18.6, concorrência 1. Cada consulta teve cinco aquecimentos e 20 amostras medidas. O tempo do banco usa `EXPLAIN (ANALYZE, BUFFERS)`; o cliente inclui túnel SSH e rede.

| Consulta | Banco p95 (ms) | Cliente p95 (ms) |
| --- | ---: | ---: |
| Lista sem termo | 57,795 | 262,632 |
| Texto: rejeição | 63,734 | 266,490 |
| Campo XML: cStat | 58,999 | 273,830 |
| Texto + coleção + formato XML | 72,341 | 281,709 |

A meta inicial de 300 ms p95 no banco foi atendida nesse cenário. Isso não é SLA, teste de múltiplos usuários, latência da API autenticada ou medição de renderização. A consulta final reúne hits de texto/campo e aplica paginação antes de carregar prévias. Não foi desabilitada proteção ou alterada configuração global do PostgreSQL para produzir a medição.

## Backup e restauração isolados

[Verificação](evidencias/documentos/backup-verification.json): dump de 13.865.895 bytes, restaurado em banco temporário exclusivo; contagens de 305 documentos, 306 versões, 11.364 trechos e 141.730 elementos conferidas. Os 294 originais distintos foram copiados e tiveram hash verificado na origem e na cópia. O banco temporário foi removido; dump e cópias permanecem em `.work/documents-backup/`, fora do Git. Nenhum banco de produção foi restaurado ou modificado.

O comando reproduzível é `node --env-file=.work/documents.env scripts/documents-backup-verify.mjs`; ele rejeita nomes de produção. Esse ensaio valida o acervo isolado, não substitui backup e ensaio do ambiente real antes de publicar.

## Pendências

1. Revisar as 12 extrações parciais e processar o pacote DOC com `antiword`; classificar os instaladores como material de software fora da leitura documental. [AVL-150](https://linear.app/avilaops/issue/AVL-150).
2. Construir/testar a imagem do worker fora do servidor, definir volume persistente e capacidade. A inspeção encontrou disco de produção com pouco espaço e ERP sem mounts.
3. Publicar ERP/worker e aplicar migrations de produção somente após autorização específica, como exige o plano. [AVL-151](https://linear.app/avilaops/issue/AVL-151).
4. Configurar chave/credencial, timezone e chamada autenticada real do n8n antes de autorizar a publicação do novo workflow. [AVL-152](https://linear.app/avilaops/issue/AVL-152).
5. Publicação/vigência normativa permanecem nulas quando não fornecidas. UF e vigência normativa não foram inferidas; filtros atuais usam coleção, categoria, formato, extração, coleta e versão.

Estado: implementação em revisão, coleta encerrada com pendências explícitas; produção não publicada.
