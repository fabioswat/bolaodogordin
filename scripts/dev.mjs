// Inicia servidor (porta 3000) e interface Vite (porta 5173) juntos para desenvolvimento.
import { spawn } from 'node:child_process';

const procs = ['dev:server', 'dev:web'].map((script) =>
  spawn('npm', ['run', script], { stdio: 'inherit', shell: true }),
);

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
