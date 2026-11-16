-- Instituição de quem recebe o Pix (só para exibir ao participante, ex.: "Mercado Pago").
ALTER TABLE pools ADD COLUMN pix_bank TEXT;
