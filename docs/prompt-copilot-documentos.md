## Objetivo
Implemente o módulo `DOCUMENTOS` no sistema localizado em `D:\Projetos\ERP`, incluindo rotas, interface, armazenamento, processamento e integração com workflows n8n, conforme detalhado nas fases e requisitos abaixo. Execute o trabalho autorizado e acessível; registre bloqueios externos sem inventar sucesso. Produção e ativação de workflows aguardam autorização específica após testes.

## Contexto e Detalhes  
- Repositório: `D:\Projetos\ERP`  
- Stack tecnológico: Next.js 16.2.9, React 19.2.4, TypeScript, pg, PostgreSQL  
- Workflow n8n a investigar:  
  - https://n8n.avilaops.com/workflow/n6lfkOJHwYCucr05 (inativo, chama `update_document` no Notas/Outline, relacionado a patch de Domi Rio/Isorgan, erro 92690; não deve ser executado)  
  - https://n8n.avilaops.com/workflow/eUYxjZQjnSFAzgiu (inativo, controlador OpenAI, chama `X3GNKFEce7M8LWBk`, sem destino próprio, frequência não confirmada, crashed 91761/91752)  
  - https://n8n.avilaops.com/workflow/X3GNKFEce7M8LWBk (ativo, conteúdo e mídia na tabela NMK4BkflBWKhtqGU, 859 registros, erro de conteúdo incompleto, campos URL, fonte, título, texto, HTML, imagens, vídeos, links, status HTTP, erro, coletado_em; arrays JSON em strings, URLs de mídia, sem binários, progresso em chave JSON, lotes de oito, crashed 91762/91753)  
  - https://n8n.avilaops.com/workflow/pjPx9JqspcXObd5w (inativo, tabela `1FGJBkGYWD3BMnHh`, URLs, títulos, textos, HTML, links, coletado_em, fila sem checkpoint, execução 88189, sucesso, cinco páginas)  
- Fontes oficiais:  
  - https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=  
  - https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=  
  - https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=hXzemuyNHW4=  
  - https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=  
- Diagnóstico adicional:  
  - Fontes NF-e deram loop de redirecionamento nesta auditoria; revalidar HTTP/navegador sem contornar WAF, preservando literalmente + / = nas query strings. Descoberta recursiva com paginação e anexos até esgotar fila dentro da allowlist oficial.  
  - Formatados HTML/PDF/TXT/MD/XML/XSD/WSDL/ZIP/SQL/planilhas, se existirem. Não presumir SQL nas fontes.  
  - Originais imutáveis por hash em armazenamento persistente real, não container efêmero, sem inventar S3/MinIO; grandes binários fora do Postgres por padrão e fora Git. PDF extraído por página e tabelas com referência; OCR apenas com motor/versão/confiança/falhas.  
  - Catálogo XSD com elementos, tipos, namespaces, ocorrências, enumerações, includes, imports e versões.  
  - Nenhum SQL baixado executado ou convertido automaticamente em migration; regras fiscais não extraídas automaticamente.  
  - Busca FTS GIN + comparação exata por código, namespace, versão, B-tree, keyset; queries parametrizadas, privilégios mínimos, tenants segregados.  
  - pg_trgm/unaccent condicionados, embeddings opcionais.  
  - Benchmarks com EXPLAIN (ANALYZE, BUFFERS), volumes, hardware, concorrência, p50/p95; meta <=300ms p95, ajustável por baseline, separar API e render.  
  - Relatórios de volume, falhas, pendências, hashes, fontes, status, links, datas em JSON/CSV.  
  - Testes, benchmarks, runbook de coleta, atualização, backup, rollback.  
  - Documentação final, evidências, limitações, cobertura de 100% dos links, separação de falhas, amostras de qualidade, revisão de referências.  
  - Ler `AGENTS.md`, `docs/ux.md`, `.agents/equipe`, `migrations/runner`, `git status`, `auth/pg/tenants`, `Linear AVL-62/AVL-69`.  
  - Preservar alterações alheias, não contratar serviços pagos, não expor segredos.  
  - Validar n8n sem publicação não autorizada, preparar ambiente isolado, solicitar aprovação de produção com resultados concretos, backups e rollback prontos.  
  - Fonte NF-e: revalidar HTTP/navegador sem contornar WAF, preservando literalmente + / = nas query strings.  
  - Descoberta recursiva com paginação/anexos até esgotar fila dentro de allowlist oficial.  
  - Formatados HTML/PDF/TXT/MD/XML/XSD/WSDL/ZIP/SQL/planilhas, se existirem.  
  - Não presumir SQL nas fontes.  
  - Originais imutáveis por hash em armazenamento persistente real, não container efêmero, sem inventar S3/MinIO; grandes binários fora do Postgres por padrão e fora Git.  
  - PDF extraído por página e tabelas com referência; OCR apenas com motor/versão/confiança/falhas.  
  - Catálogo XSD com elementos, tipos, namespaces, ocorrências, enumerações, includes, imports e versões.  
  - Nenhum SQL baixado executado ou convertido automaticamente em migration; regras fiscais não extraídas automaticamente.  
  - Busca FTS GIN + comparação exata por código/namespace/versão, B-tree, keyset; queries parametrizadas, privilégios mínimos, tenants segregados.  
  - pg_trgm/unaccent condicionados, embeddings opcionais.  
  - Bench EXPLAIN (ANALYZE, BUFFERS) em ambiente seguro, volumes, hardware, concorrência, p50/p95; meta <=300ms p95, ajustável por baseline, separar API/render, nunca prometer sem medir.  
  - Relatar baixado/extraído/indexado/falhas/pendentes separadamente.  
  - Validar fontes, dados, segurança, backup/restore, dedup, retomada; validar n8n sem publicação não autorizada.  

## Implementação e entregáveis
Implemente o módulo `DOCUMENTOS` no sistema, incluindo:  
- Rotas e endpoints `/documentos` com funcionalidades de listagem, filtros, detalhes, prévias, download, referências, histórico, status, painel de falhas, com HTML sanitizado, sem execução de anexos.  
- Interface responsiva seguindo `docs/ux.md`.  
- Pipeline de coleta incremental de fontes, com controle de tempo, tamanho, retries, ETag, Last-Modified, SHA-256, normalização, indexação, validação.  
- Armazenamento de bytes originais em armazenamento persistente real, com metadados no PostgreSQL, incluindo URL, cadeia de origem, hash, tamanho, MIME, charset, datas, categoria, versão, relações.  
- Processamento de formatos PDF, XML, XSD, WSDL, ZIP, SQL, com extração, OCR (quando necessário), preservação de namespaces, dependências, limites de expansão, proteção contra vulnerabilidades.  
- Modelo relacional com tabelas para coleções, documentos, versões, assets, páginas, vínculos, categorias, jobs, catálogo de schemas, com índices, integridade, separação de acervo técnico oficial e documentos privados.  
- Busca rápida com FTS, configurações linguísticas, índices GIN e B-tree, filtros por coleção, categoria, tipo, origem, UF, vigência, versão, status, data.  
- Integração com workflows n8n, reuso de padrões, validação, ambiente isolado, sem publicação ou substituição sem autorização.  
- Medição de performance, geração de relatórios de volume, falhas, pendências, hashes, fontes, status, links, datas, em JSON/CSV.  
- Testes, benchmarks, runbook de coleta, atualização, backup, rollback.  
- Documentação final, evidências, limitações, restrições, incluindo cobertura de 100% dos links, separação de falhas, amostras de qualidade, revisão de referências.

## Orientação final
Comece pela inspeção em leitura, implemente e valide o módulo com as ferramentas disponíveis e entregue caminhos dos artefatos, diff, testes, métricas e pendências.

## Precisões operacionais obrigatórias

Estas precisões complementam o texto refinado pelo Prompt Perfect e prevalecem em caso de ambiguidade. O diagnóstico é um retrato consultado em 17/10/2026, sujeito a mudanças.

- A tabela OpenAI tem 859 registros, mas o erro de conteúdo incompleto foi confirmado somente na amostra consultada: HTTP 200, 41 caracteres de texto. Não generalize essa qualidade para todas as linhas. O draft do coletor difere do publicado; compare ambos. A causa dos estados `crashed` ainda não foi apurada.
- O ID `xeC1Bn8wpAVyjSLU` identifica o projeto n8n. A tabela de progresso é `YZUCih7eGR1Ryyyp`, com colunas `chave` e `estado` JSON serializado. A fila Brave não tem checkpoint dedicado nos nós examinados. O sucesso de cinco páginas é resultado histórico, não inventário atual completo.
- Os nós examinados gravam em Data Tables, sem destino PostgreSQL de aplicação explícito. Isso não identifica o banco físico, volumes ou backups do n8n. Inspecione esses destinos em leitura e documente as evidências. Não altere tabelas internas do n8n nem migre OpenAI/Brave para a coleção fiscal; mantenha coleções e permissões distintas se houver migração posterior autorizada.
- Preserve esquema de isolamento e convenções existentes do ERP. Use migrations próprias numeradas pelo runner real, FKs, unicidade, queries parametrizadas e campos tipados para filtros frequentes. JSONB fica para metadados variáveis. Índices `CONCURRENTLY` exigem tratamento fora de transação quando utilizados; não aplique essa opção indiscriminadamente.
- A biblioteca deve permitir localizar título, documento, versão e página do trecho encontrado. FTS por linguagem e comparação exata por código/namespace são mecanismos complementares. A meta inicial de 300 ms p95 se refere à consulta no banco, com dataset, hardware e concorrência declarados; meça API e renderização separadamente e não execute carga pesada em produção.
- Considere completos somente os links descobertos e classificados dentro do escopo definido. Informe separadamente descobertos, baixados, extraídos, indexados, duplicados, bloqueados, falhos, pendentes e excluídos com justificativa. Cem por cento de links classificados não significa cem por cento de downloads ou extrações bem-sucedidos.
- Preserve o último original e a última extração válidos quando nova coleta falhar. Retomada exige checkpoint, lease e exclusão mútua transacional; consultar execuções n8n não elimina sozinho as corridas. Teste reinício, duas execuções concorrentes, URL idêntica com novo conteúdo e conteúdo idêntico com URLs diferentes.
- Extraia PDFs por página; use OCR somente nas páginas que precisarem, preservando versão do extrator, confiança/limitações, tabelas e referências. Dados incertos ficam em staging para revisão. Nenhuma regra tributária extraída deve ser aplicada automaticamente à emissão.
- Trate SQL baixado como conteúdo não confiável e mantenha-o separado das migrations geradas pelo projeto. Não execute dumps/scripts externos. Proteja download e redirects contra SSRF/IP interno, parsers XML contra XXE, ZIP contra traversal/bomb e prévias HTML contra conteúdo ativo. Use limites de expansão, tamanho, tempo e memória.
- A UI segue as sete perguntas de `docs/ux.md` e deve ser medida em 360×640, 390×844, 430×932, 1366×768 e 1440×900, com controles de pelo menos 44 px e componentes compartilhados de `ui.tsx` e `FitRows`.
- Reuse credenciais existentes sem mostrar valores; confirme acesso ao servidor e dependências. Não contrate serviços pagos. Prepare exportação sanitizada, diff, validação e testes dos workflows. Não ative/desative/substitua workflows ou aplique mudanças em produção sem autorização específica para esse passo.
- Entregue auditoria de cada workflow, inventário JSON/CSV, decisão de armazenamento, diagrama/dicionário relacional, migrations, queries, índices, pipeline, UI, testes e benchmarks reproduzíveis, documentação e runbook de backup/restauração e rollback. Diferencie proposto, implementado, testado, migrado, publicado e validado. Não apresente plano ou testes simulados como execução externa concluída.
