-- Valores iniciais dos parâmetros: os do protótipo (docs/manual/paginas/16-parametros.md).
-- A partir daqui a fonte é o banco; a diretoria altera pela tela de Parâmetros.
-- Se a linha já existe (alguém gravou antes desta migração), nada muda.

INSERT INTO pricing_params (
    id, target_net_profit, free_discount, safety_margin, min_down_payment, proposal_validity_days,
    icms_sp, pis_cofins, ipi, income_tax,
    commission, ads, gateway, icms_interstate, other_sales_rate,
    fixed_monthly_expenses, updated_by
) VALUES (
    true, 0.15, 0.20, 0.05, 0.65, 7,
    0.18, 0.0925, 0.13, 0.34,
    0.02, 0.005, 0, 0.04, 0.025,
    0, 'migracao-0002'
)
ON CONFLICT (id) DO NOTHING;
