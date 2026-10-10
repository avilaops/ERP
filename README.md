# ERP Ávila Ops

Sistema comercial multi-empresa, desenvolvido pela Ávila Ops Tecnologia e servido em `erp.avilaops.com`. A primeira empresa é a Ludus Equipamentos (importação e venda de equipamentos de musculação). Cada empresa tem os seus dados num esquema próprio do banco; como incluir uma está em [`docs/operacao.md`](docs/operacao.md).

## Documentação

- [Manual do sistema](docs/manual/README.md): uma página por funcionalidade, com passo a passo e prints. Versão navegável em [`docs/manual/index.html`](docs/manual/index.html).
- [Roadmap do desenvolvimento](docs/roadmap.md): fases, prazos, pagamentos e pendências.
- [Conformidade da NF-e com as normas](docs/fiscal-conformidade-nfe.md): cada regra do leiaute e das notas técnicas, onde o sistema atende, como é testado e o que está pendente.
- [Instruções do Copilot](.github/copilot-instructions.md): stack (PostgreSQL), arquitetura e regras de negócio.
- [Prompts por fase](docs/copilot/prompts.md): um prompt do Copilot para cada fase do roadmap.

## Como rodar

Requer Node 24, npm e um PostgreSQL ao alcance da máquina.

```bash
npm install
cp .env.example .env.local   # ajuste os valores (DATABASE_URL aponta para um banco vazio, só do ERP)
npm run db:migrate           # cria as tabelas e os parâmetros iniciais
npm run dev                  # http://localhost:3020
```

O login é o do **Auth central** (`auth.avilaops.com`). Depois de entrar, o Auth devolve sempre para o endereço cadastrado para o ERP, `https://erp.avilaops.com`, e nunca para `localhost`: o retorno é conferido pelo host, e o cookie de sessão só vale em `avilaops.com`. Por isso, abrindo por `localhost`, você só volta a ver o sistema se `erp.avilaops.com` estiver no ar e servindo este ERP.

Para ver as telas na própria máquina sem depender disso, descomente `ERP_LOCAL_LOGIN=1` no `.env.local`: `http://localhost:3020` passa a abrir o login local (`/dev/login`), com um usuário de teste por perfil. Ele não existe em produção.

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o sistema em desenvolvimento em `http://localhost:3020` (só atende em `127.0.0.1`). |
| `npm run build` | Gera a versão de produção. |
| `npm run start` | Serve a versão de produção (exige as variáveis do `.env.example`, com `SSO_JWT_SECRET` de 32+ caracteres e `APP_URL` em https). |
| `npm run lint` | Confere o código com o ESLint. |
| `npm run typecheck` | Confere os tipos do TypeScript. |
| `npm test` | Roda os testes automatizados (os de banco usam `ERP_TEST_DATABASE_URL`, de `.env.test.local`). |
| `npm run db:migrate` | Cria o esquema de cada empresa de `ERP_TENANTS` e aplica as migrações pendentes de `db/migrations/` em todos. Rodar de novo não muda nada. |
| `npm run db:import-products -- <pasta> --empresa <identificador> [--apply]` | Carrega em lote equipamentos, descrições e fotos numa empresa. Sem `--apply` só confere e mostra o que faria. |

O login é feito pelo Auth central da Ávila Ops, e o perfil de cada pessoa (Diretoria, Gerente comercial, Vendedor ou Financeiro) é definido dentro do ERP. Em desenvolvimento, com `ERP_LOCAL_LOGIN=1` no `.env.local`, `/dev/login` entra com um usuário de teste por perfil. Detalhes e regras para quem mexe no código estão no [`AGENTS.md`](AGENTS.md).

## Carga em lote de equipamentos e fotos

Para cadastrar de uma vez os equipamentos de uma empresa, com descrição e foto:

```bash
npm run db:import-products -- /caminho/da/pasta --empresa ludus           # só confere, não grava
npm run db:import-products -- /caminho/da/pasta --empresa ludus --apply   # grava
```

`--empresa` é obrigatório e tem de ser um identificador de `ERP_TENANTS`. O comando mostra o banco e a empresa de destino antes de qualquer coisa.

A pasta tem este formato:

```text
pasta/
  equipamentos.csv
  fotos/
    LD-B001.jpg
    LD-B002.png
```

`equipamentos.csv` é UTF-8, separado por `;`, com cabeçalho na primeira linha. Colunas obrigatórias: `codigo`, `nome` e `descricao` (a descrição pode vir vazia). Opcionais: `fornecedor`, `modelo` e `preco_usd` (`1234.56` ou `1.234,56`). Texto com `;` ou quebra de linha vai entre aspas duplas. Exemplo:

```csv
codigo;nome;descricao;fornecedor;modelo;preco_usd
LD-B001;MESA FLEXORA - BATERIA DE PESOS;"Estrutura em aço; bateria de 100 kg";DHZ;SM5001;605
LD-B002;CADEIRA EXTENSORA;;;;
```

Cada foto se chama `<codigo>.jpg`, `.jpeg`, `.png` ou `.webp`, sem diferenciar maiúsculas, e fica direto em `fotos/` (subpasta não é lida). Uma foto por equipamento, de até 15 MB; o sistema guarda uma cópia reduzida (até 1200 × 1200).

O que a carga faz: código novo cria o equipamento, sem custo; código que já existe tem o nome atualizado e, só quando vierem preenchidos, a descrição e os dados do fornecedor. Custo, crédito de impostos, embalagem e ativo/inativo nunca são alterados. Qualquer erro na planilha ou numa foto para tudo, com a lista completa dos erros, e nada é gravado. A última linha da saída resume o resultado:

```text
criados=2 atualizados=0 inalterados=0 fotos_gravadas=1 fotos_iguais=0 sem_foto=1 fotos_sem_equipamento=0
```

## Contato

Ávila Ops Tecnologia · (17) 99781-1471 · avilaops.com
