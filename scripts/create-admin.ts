// Cria um usuário administrador com senha provisória.
// Uso: npm run create-admin -- <nick> "<Nome>"
import { databaseFile } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db.ts';
import { createUser } from '../src/server/services/users.ts';

const [nickname, ...nameParts] = process.argv.slice(2);
if (!nickname) {
  console.error('Uso: npm run create-admin -- <nick> "<Nome>"');
  process.exit(1);
}

const db = openDatabase(databaseFile());
try {
  const { user, tempPassword } = createUser(db, null, {
    nickname,
    displayName: nameParts.join(' ').trim() || nickname,
    role: 'admin',
  });
  console.log(`Administrador criado: ${user.nickname}`);
  console.log(`Senha provisória: ${tempPassword}`);
  console.log('A senha deverá ser trocada no primeiro acesso.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  db.close();
}
