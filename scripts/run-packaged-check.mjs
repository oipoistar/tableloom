import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
const executable = path.resolve(process.argv[2] ?? 'release/win-unpacked/Tableloom.exe');
const resultFile = path.resolve('artifacts/packaged-check.json');
await rm(resultFile, { force: true });
const env = { ...process.env, TABLELOOM_SMOKE_TEST: '1', TABLELOOM_SMOKE_OUTPUT: path.dirname(resultFile) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (data) => (output += data));
child.stderr.on('data', (data) => (output += data));
const timer = setTimeout(() => child.kill(), 45000);
try {
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (code !== 0) throw new Error(`Packaged app exited ${code}: ${output.slice(-3000)}`);
  const result = JSON.parse(await readFile(resultFile, 'utf8'));
  if (!result.packaged || !result.homeLoaded) throw new Error('Packaged application check failed');
  console.log(JSON.stringify({ ...result, executable }));
} finally {
  clearTimeout(timer);
}
