-- Exclusão de usuário: a conta sai das listas e o nick fica livre, mas o histórico continua consistente.
ALTER TABLE users ADD COLUMN deleted_at TEXT;
