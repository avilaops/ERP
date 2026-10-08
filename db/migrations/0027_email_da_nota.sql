-- Envio do XML e do DANFE ao cliente por e-mail.
-- Uma linha por empresa: o texto da mensagem (vale para qualquer caixa de saída) e, se a empresa
-- quiser sair pelo próprio domínio, a caixa dela. Sem caixa própria, sai pela caixa da Ávila Ops,
-- configurada no ambiente do servidor.
CREATE TABLE mail_settings (
    id             boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- Em branco, o texto padrão do sistema. Aceitam {numero}, {serie}, {empresa}, {cliente} e {chave}.
    nfe_subject    text CHECK (nfe_subject IS NULL OR length(btrim(nfe_subject)) BETWEEN 3 AND 150),
    nfe_body       text CHECK (nfe_body IS NULL OR length(btrim(nfe_body)) BETWEEN 10 AND 4000),
    -- Para onde vai a resposta do cliente.
    reply_to       text CHECK (reply_to IS NULL OR reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- Enviar sozinho assim que a nota é autorizada, quando o cliente tem e-mail.
    auto_send      boolean NOT NULL DEFAULT true,
    smtp_host      text CHECK (smtp_host IS NULL OR smtp_host ~ '^[A-Za-z0-9.-]{3,253}$'),
    smtp_port      integer CHECK (smtp_port IS NULL OR smtp_port BETWEEN 1 AND 65535),
    smtp_username  text CHECK (smtp_username IS NULL OR length(btrim(smtp_username)) BETWEEN 1 AND 254),
    -- A senha da caixa só existe cifrada (AES-256-GCM, chave ERP_CERT_KEY do servidor), como o certificado.
    smtp_password  bytea CHECK (smtp_password IS NULL OR octet_length(smtp_password) BETWEEN 1 AND 2048),
    smtp_iv        bytea CHECK (smtp_iv IS NULL OR octet_length(smtp_iv) = 12),
    smtp_tag       bytea CHECK (smtp_tag IS NULL OR octet_length(smtp_tag) = 16),
    smtp_from      text CHECK (smtp_from IS NULL OR smtp_from ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text NOT NULL CHECK (btrim(updated_by) <> ''),
    -- A caixa própria vem inteira ou não vem.
    CHECK (num_nulls(smtp_host, smtp_port, smtp_username, smtp_password, smtp_iv, smtp_tag, smtp_from) IN (0, 7))
);

-- Cada tentativa de envio de uma nota, com o resultado: nenhum e-mail sai sem registro.
CREATE TABLE fiscal_invoice_mails (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  integer NOT NULL REFERENCES fiscal_invoices (id),
    -- nota: XML autorizado e DANFE. cancelamento: o XML do evento de cancelamento.
    kind        text NOT NULL CHECK (kind IN ('nota', 'cancelamento')),
    recipient   text NOT NULL CHECK (recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- Por qual caixa saiu: a da empresa ou a da Ávila Ops.
    channel     text NOT NULL CHECK (channel IN ('empresa', 'avilaops')),
    status      text NOT NULL CHECK (status IN ('enviado', 'falhou')),
    -- O que o servidor de e-mail respondeu quando falhou.
    detail      text,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    sent_by     text NOT NULL CHECK (btrim(sent_by) <> '')
);

CREATE INDEX fiscal_invoice_mails_invoice_idx ON fiscal_invoice_mails (invoice_id, id DESC);
