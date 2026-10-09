-- Convite por e-mail de quem a empresa põe para dentro (Equipe e acessos).
-- O ERP pede a conta ao login central e escreve para a pessoa com o endereço onde ela define a
-- senha. Aqui fica só o que aconteceu com o último convite; o endereço nunca é guardado.
ALTER TABLE users
    -- enviado: o e-mail saiu. falhou: tentou e não saiu. pendente: o envio não está ligado neste servidor.
    ADD COLUMN invite_status text CHECK (invite_status IN ('enviado', 'falhou', 'pendente')),
    ADD COLUMN invite_detail text,
    ADD COLUMN invite_at     timestamptz,
    ADD CONSTRAINT users_invite_whole CHECK ((invite_status IS NULL) = (invite_at IS NULL));
