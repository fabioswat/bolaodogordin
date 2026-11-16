import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

// Carrega variáveis do arquivo .env (se existir), sem sobrescrever as já definidas.
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
}

function resolveDir(value: string | undefined, fallback: string): string {
  return path.resolve(root, value || fallback);
}

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dataDir: resolveDir(process.env.DATA_DIR, 'data'),
  backupDir: resolveDir(process.env.BACKUP_DIR, 'backups'),
  backupKeep: Number(process.env.BACKUP_KEEP || 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  // Endereços públicos aceitos além do próprio host (ex.: https://bolao.seudominio.com.br)
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  webDir: path.join(root, 'dist', 'web'),
};

export function databaseFile(dataDir = config.dataDir): string {
  return path.join(dataDir, 'bolao.db');
}
