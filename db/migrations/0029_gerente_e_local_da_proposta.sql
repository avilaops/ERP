-- O que a proposta diz além do vendedor: o gerente comercial da empresa e o local de emissão
-- ("Votuporanga/SP"). Em branco, a proposta sai sem eles.
ALTER TABLE company_settings
    ADD COLUMN proposal_manager_name text CHECK (proposal_manager_name IS NULL OR length(btrim(proposal_manager_name)) BETWEEN 2 AND 80),
    ADD COLUMN proposal_place        text CHECK (proposal_place IS NULL OR length(btrim(proposal_place)) BETWEEN 2 AND 80);
