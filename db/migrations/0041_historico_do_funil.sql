-- Por onde cada oportunidade passou. O funil mostra onde ela está; o painel precisa saber
-- por quais etapas ela andou, para dizer quantas chegam a cada uma e onde param.
CREATE TABLE opportunity_moves (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    -- A etapa em que entrou. O nome fica guardado: uma etapa removida ou renomeada não apaga a história.
    stage_id        integer REFERENCES pipeline_stages (id),
    stage_name      text NOT NULL CHECK (btrim(stage_name) <> ''),
    stage_kind      text NOT NULL CHECK (stage_kind IN ('aberta', 'ganha', 'perdida')),
    moved_at        timestamptz NOT NULL DEFAULT now(),
    moved_by        text NOT NULL CHECK (btrim(moved_by) <> '')
);
CREATE INDEX opportunity_moves_opportunity_idx ON opportunity_moves (opportunity_id, id);

-- As que já existem entram com a etapa em que estão hoje.
INSERT INTO opportunity_moves (opportunity_id, stage_id, stage_name, stage_kind, moved_at, moved_by)
SELECT o.id, s.id, s.name, s.kind, o.updated_at, o.updated_by FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id;
