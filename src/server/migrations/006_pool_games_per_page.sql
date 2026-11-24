-- Jogos por página na lista pública do bolão; vazio = padrão (10).
ALTER TABLE pools ADD COLUMN games_per_page INTEGER CHECK (games_per_page BETWEEN 1 AND 100);
