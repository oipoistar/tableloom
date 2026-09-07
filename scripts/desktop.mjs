import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  windowsHide: true,
});
let desktop;
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    if ((await fetch('http://127.0.0.1:5173')).ok) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 200));
}
const env = { ...process.env, TABLELOOM_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', windowsHide: true, env });
desktop.on('exit', (code) => {
  vite.kill();
  process.exitCode = code ?? 0;
});
process.on('SIGINT', () => {
  desktop.kill();
  vite.kill();
});
