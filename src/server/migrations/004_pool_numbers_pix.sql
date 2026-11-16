-- Dezenas por jogo configuráveis por bolão (6 a 20) e dados do Pix para pagamento.
ALTER TABLE pools ADD COLUMN numbers_per_game INTEGER NOT NULL DEFAULT 6 CHECK (numbers_per_game BETWEEN 6 AND 20);
ALTER TABLE pools ADD COLUMN pix_key TEXT;
ALTER TABLE pools ADD COLUMN pix_name TEXT;
ALTER TABLE pools ADD COLUMN pix_city TEXT;
