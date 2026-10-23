-- Documento fiscal de entrada preservado como recebido. Nada desta tabela movimenta estoque.
CREATE TABLE fiscal_received_nfes (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    access_key         text NOT NULL CHECK (access_key ~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$'),
    xml_sha256         text NOT NULL CHECK (xml_sha256 ~ '^[0-9a-f]{64}$'),
    xml                text NOT NULL CHECK (octet_length(xml) BETWEEN 1 AND 2097152),
    protocol           text NOT NULL CHECK (btrim(protocol) <> ''),
    status_code        text NOT NULL,
    issuer_document    text NOT NULL CHECK (issuer_document ~ '^[0-9A-Z]{14}$'),
    issuer_name        text NOT NULL CHECK (btrim(issuer_name) <> ''),
    recipient_document text NOT NULL CHECK (recipient_document ~ '^[0-9A-Z]{11,14}$'),
    number             bigint NOT NULL CHECK (number > 0),
    series             integer NOT NULL CHECK (series >= 0),
    issued_at          timestamptz NOT NULL,
    total_products     numeric(14,2) NOT NULL CHECK (total_products >= 0),
    total_invoice      numeric(14,2) NOT NULL CHECK (total_invoice >= 0),
    total_freight      numeric(14,2) NOT NULL CHECK (total_freight >= 0),
    total_insurance    numeric(14,2) NOT NULL CHECK (total_insurance >= 0),
    total_other        numeric(14,2) NOT NULL CHECK (total_other >= 0),
    total_discount     numeric(14,2) NOT NULL CHECK (total_discount >= 0),
    total_icms         numeric(14,2) NOT NULL CHECK (total_icms >= 0),
    total_icms_st      numeric(14,2) NOT NULL CHECK (total_icms_st >= 0),
    total_ipi          numeric(14,2) NOT NULL CHECK (total_ipi >= 0),
    total_import_tax   numeric(14,2) NOT NULL CHECK (total_import_tax >= 0),
    total_pis          numeric(14,2) NOT NULL CHECK (total_pis >= 0),
    total_cofins       numeric(14,2) NOT NULL CHECK (total_cofins >= 0),
    supplier_id        integer REFERENCES suppliers (id),
    supplier_linked_at timestamptz,
    supplier_linked_by text,
    purchase_id        integer REFERENCES purchases (id),
    canceled_at        timestamptz,
    cancellation_protocol text,
    imported_at        timestamptz NOT NULL DEFAULT now(),
    imported_by        text NOT NULL CHECK (btrim(imported_by) <> ''),
    UNIQUE (access_key),
    UNIQUE (xml_sha256),
    UNIQUE (purchase_id)
);

CREATE INDEX fiscal_received_nfes_issued_idx ON fiscal_received_nfes (issued_at DESC, id DESC);
CREATE INDEX fiscal_received_nfes_issuer_idx ON fiscal_received_nfes (issuer_document);

CREATE TABLE fiscal_received_nfe_items (
    nfe_id             bigint NOT NULL REFERENCES fiscal_received_nfes (id),
    line_number        integer NOT NULL CHECK (line_number > 0),
    supplier_code      text,
    ean                text,
    description        text NOT NULL CHECK (btrim(description) <> ''),
    ncm                text NOT NULL CHECK (ncm ~ '^[0-9]{8}$'),
    cest               text CHECK (cest IS NULL OR cest ~ '^[0-9]{7}$'),
    cfop               text NOT NULL CHECK (cfop ~ '^[0-9]{4}$'),
    commercial_unit    text NOT NULL,
    quantity           numeric(15,4) NOT NULL CHECK (quantity > 0),
    unit_value         numeric(17,10) NOT NULL CHECK (unit_value >= 0),
    product_value      numeric(14,2) NOT NULL CHECK (product_value >= 0),
    freight_value      numeric(14,2) NOT NULL CHECK (freight_value >= 0),
    insurance_value    numeric(14,2) NOT NULL CHECK (insurance_value >= 0),
    discount_value     numeric(14,2) NOT NULL CHECK (discount_value >= 0),
    other_value        numeric(14,2) NOT NULL CHECK (other_value >= 0),
    icms_value         numeric(14,2) NOT NULL CHECK (icms_value >= 0),
    icms_st_value      numeric(14,2) NOT NULL CHECK (icms_st_value >= 0),
    ipi_value          numeric(14,2) NOT NULL CHECK (ipi_value >= 0),
    import_tax_value   numeric(14,2) NOT NULL CHECK (import_tax_value >= 0),
    pis_value          numeric(14,2) NOT NULL CHECK (pis_value >= 0),
    cofins_value       numeric(14,2) NOT NULL CHECK (cofins_value >= 0),
    product_id         integer REFERENCES products (id),
    product_linked_at  timestamptz,
    product_linked_by  text,
    PRIMARY KEY (nfe_id, line_number)
);

CREATE INDEX fiscal_received_nfe_items_product_idx ON fiscal_received_nfe_items (product_id) WHERE product_id IS NOT NULL;

-- Histórico imutável do custo confirmado pela nota. O custo atual do produto pode mudar;
-- esta linha conserva de onde veio cada valor.
CREATE TABLE product_cost_history (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  integer NOT NULL REFERENCES products (id),
    nfe_id      bigint NOT NULL REFERENCES fiscal_received_nfes (id),
    line_number integer NOT NULL,
    unit_cost   numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
    components  jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    recorded_by text NOT NULL CHECK (btrim(recorded_by) <> ''),
    UNIQUE (nfe_id, line_number),
    FOREIGN KEY (nfe_id, line_number) REFERENCES fiscal_received_nfe_items (nfe_id, line_number)
);

CREATE INDEX product_cost_history_product_idx ON product_cost_history (product_id, recorded_at DESC, id DESC);

