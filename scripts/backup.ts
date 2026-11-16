// Gera uma cópia consistente do banco (VACUUM INTO), mesmo com o servidor em execução,
// e mantém somente as cópias mais recentes (BACKUP_KEEP, padrão 30).
// Uso: npm run backup
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { config, databaseFile } from '../src/server/config.ts';

const source = databaseFile();
if (!existsSync(source)) {
  console.error(`Banco não encontrado: ${source}`);
  process.exit(1);
}

mkdirSync(config.backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = path.join(config.backupDir, `bolao-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(target);
} finally {
  db.close();
}

const check = new DatabaseSync(target, { readOnly: true });
const integrity = check.prepare('PRAGMA integrity_check').get();
check.close();
if (integrity?.integrity_check !== 'ok') {
  console.error('Falha na verificação de integridade do backup:', integrity);
  process.exit(1);
}

const old = readdirSync(config.backupDir)
  .filter((f) => /^bolao-\d{8}-\d{6}\.db$/.test(f))
  .sort()
  .reverse()
  .slice(Math.max(config.backupKeep, 1));
for (const f of old) rmSync(path.join(config.backupDir, f));

console.log(`Backup criado: ${target}`);
if (old.length) console.log(`Backups antigos removidos: ${old.length}`);
