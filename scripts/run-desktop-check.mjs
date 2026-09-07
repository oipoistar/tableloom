import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const processHandle = spawn(require('electron'), ['scripts/verify-desktop.cjs'], {
  stdio: 'inherit',
  env,
  windowsHide: true,
});
processHandle.on('exit', (code) => (process.exitCode = code ?? 1));
