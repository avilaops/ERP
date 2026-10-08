-- Regras fiscais da nota: o que o contador define, por linha de produto, e a
-- empresa edita na tela. Nenhum código fiscal fica no programa.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

CREATE TABLE fiscal_rules (
    line_id                       integer PRIMARY KEY REFERENCES product_lines (id),
    -- "Venda de mercadoria", "Venda de produção do estabelecimento"…
    operation_nature              text,
    -- CFOP de venda: dentro do estado, para contribuinte de outro estado e para não contribuinte de outro estado.
    cfop_internal                 text CHECK (cfop_internal IS NULL OR cfop_internal ~ '^5[0-9]{3}$'),
    cfop_interstate               text CHECK (cfop_interstate IS NULL OR cfop_interstate ~ '^6[0-9]{3}$'),
    cfop_interstate_non_taxpayer  text CHECK (cfop_interstate_non_taxpayer IS NULL OR cfop_interstate_non_taxpayer ~ '^6[0-9]{3}$'),
    -- CST do ICMS (regime normal, dois dígitos) ou CSOSN (Simples, três dígitos).
    icms_code                     text CHECK (icms_code IS NULL OR icms_code ~ '^[0-9]{2,3}$'),
    -- Em branco: a nota sai sem o grupo do IPI.
    ipi_cst                       text CHECK (ipi_cst IS NULL OR ipi_cst ~ '^[0-9]{2}$'),
    ipi_frame_code                text NOT NULL DEFAULT '999' CHECK (ipi_frame_code ~ '^[0-9]{3}$'),
    pis_cst                       text CHECK (pis_cst IS NULL OR pis_cst ~ '^[0-9]{2}$'),
    pis_rate                      numeric(9,8) NOT NULL DEFAULT 0 CHECK (pis_rate >= 0 AND pis_rate < 1),
    cofins_cst                    text CHECK (cofins_cst IS NULL OR cofins_cst ~ '^[0-9]{2}$'),
    cofins_rate                   numeric(9,8) NOT NULL DEFAULT 0 CHECK (cofins_rate >= 0 AND cofins_rate < 1),
    -- O comprador usa o equipamento (não revende): é o que traz o DIFAL e o IPI para a base do ICMS.
    final_consumer                boolean NOT NULL DEFAULT true,
    ipi_in_icms_base              boolean NOT NULL DEFAULT true,
    -- Texto fixo das informações complementares da nota.
    additional_info               text,
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    updated_by                    text NOT NULL CHECK (btrim(updated_by) <> '')
);

-- Forma de pagamento da nota (tPag): 01 dinheiro, 03 cartão de crédito, 04 cartão de
-- débito, 15 boleto, 16 depósito, 17 PIX, 18 transferência, 99 outros.
ALTER TABLE payment_methods ADD COLUMN nfe_code text CHECK (nfe_code IS NULL OR nfe_code ~ '^[0-9]{2}$');

-- Palpite inicial pelo nome; o que não bater fica em branco para a empresa escolher.
UPDATE payment_methods SET nfe_code = CASE
    WHEN label ILIKE '%pix%' THEN '17'
    WHEN label ILIKE '%boleto%' THEN '15'
    WHEN label ILIKE '%crédito%' OR label ILIKE '%credito%' THEN '03'
    WHEN label ILIKE '%débito%' OR label ILIKE '%debito%' THEN '04'
    WHEN label ILIKE '%dinheiro%' THEN '01'
    WHEN label ILIKE '%cheque%' THEN '02'
    WHEN label ILIKE '%transfer%' OR label ILIKE '%ted%' THEN '18'
    WHEN label ILIKE '%depósito%' OR label ILIKE '%deposito%' THEN '16'
    END;
