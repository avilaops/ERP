-- Alíquotas por estado: saem do código e passam a ser tabela, editável pela diretoria
-- na tela de Parâmetros. Se a lei mudar, quem muda o número é o cliente.
-- Sem nome de esquema: os testes aplicam este arquivo num esquema próprio.

CREATE TABLE state_tax_rates (
    uf            text PRIMARY KEY CHECK (uf IN ('AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')),
    -- Alíquota interna do ICMS no estado: o DIFAL é o que ela passa da interestadual.
    internal_icms numeric(9,8) NOT NULL CHECK (internal_icms >= 0 AND internal_icms < 1),
    -- Fundo de Combate à Pobreza do estado, pago junto com o DIFAL.
    fcp           numeric(9,8) NOT NULL DEFAULT 0 CHECK (fcp >= 0 AND fcp < 1),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text NOT NULL CHECK (btrim(updated_by) <> '')
);

-- Valores iniciais: os que estavam no código. Só MA (23%) e SP (18%) vêm do protótipo;
-- os outros são provisórios, a confirmar com o contador. Se a linha já existe, nada muda.
INSERT INTO state_tax_rates (uf, internal_icms, fcp, updated_by) VALUES
    ('AC', 0.19, 0, 'migracao-0006'),
    ('AL', 0.19, 0, 'migracao-0006'),
    ('AM', 0.2, 0, 'migracao-0006'),
    ('AP', 0.18, 0, 'migracao-0006'),
    ('BA', 0.205, 0, 'migracao-0006'),
    ('CE', 0.2, 0, 'migracao-0006'),
    ('DF', 0.2, 0, 'migracao-0006'),
    ('ES', 0.17, 0, 'migracao-0006'),
    ('GO', 0.19, 0, 'migracao-0006'),
    ('MA', 0.23, 0, 'migracao-0006'),
    ('MG', 0.18, 0, 'migracao-0006'),
    ('MS', 0.17, 0, 'migracao-0006'),
    ('MT', 0.17, 0, 'migracao-0006'),
    ('PA', 0.19, 0, 'migracao-0006'),
    ('PB', 0.2, 0, 'migracao-0006'),
    ('PE', 0.205, 0, 'migracao-0006'),
    ('PI', 0.225, 0, 'migracao-0006'),
    ('PR', 0.195, 0, 'migracao-0006'),
    ('RJ', 0.22, 0, 'migracao-0006'),
    ('RN', 0.2, 0, 'migracao-0006'),
    ('RO', 0.195, 0, 'migracao-0006'),
    ('RR', 0.2, 0, 'migracao-0006'),
    ('RS', 0.17, 0, 'migracao-0006'),
    ('SC', 0.17, 0, 'migracao-0006'),
    ('SE', 0.19, 0, 'migracao-0006'),
    ('SP', 0.18, 0, 'migracao-0006'),
    ('TO', 0.2, 0, 'migracao-0006')
ON CONFLICT (uf) DO NOTHING;

-- O retrato das alíquotas em cada versão publicada da tabela: o pedido faz a conta
-- com as da versão em que foi feito, não com as de hoje. Não se altera nem se apaga.
CREATE TABLE price_table_state_rates (
    version       integer NOT NULL REFERENCES price_table_versions (version),
    uf            text NOT NULL CHECK (uf IN ('AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')),
    internal_icms numeric(9,8) NOT NULL CHECK (internal_icms >= 0 AND internal_icms < 1),
    fcp           numeric(9,8) NOT NULL CHECK (fcp >= 0 AND fcp < 1),
    PRIMARY KEY (version, uf)
);

-- As versões publicadas antes desta migração foram calculadas com os valores do código,
-- que são os que acabaram de entrar em state_tax_rates.
INSERT INTO price_table_state_rates (version, uf, internal_icms, fcp)
SELECT versions.version, rates.uf, rates.internal_icms, rates.fcp
  FROM price_table_versions AS versions
 CROSS JOIN state_tax_rates AS rates;
