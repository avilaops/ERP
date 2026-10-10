-- O módulo de produção passa a ser escolha da empresa: quem revende equipamento pronto não
-- tem chão de fábrica. Desligado, some do menu e das telas; nada do que já foi gravado se perde.
ALTER TABLE company_settings ADD COLUMN production_enabled boolean NOT NULL DEFAULT false;
