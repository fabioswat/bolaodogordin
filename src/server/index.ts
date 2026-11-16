import { config, databaseFile } from './config.ts';
import { openDatabase } from './db.ts';
import { buildApp } from './app.ts';

const db = openDatabase(databaseFile());
const isProduction = process.env.NODE_ENV === 'production';

const app = await buildApp({
  db,
  logger: true,
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
  allowedOrigins: config.allowedOrigins,
  webDir: config.webDir,
});

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Bolão da Virada em http://localhost:${config.port} (${isProduction ? 'produção' : 'desenvolvimento'})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
