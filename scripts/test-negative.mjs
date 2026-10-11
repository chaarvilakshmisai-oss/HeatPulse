import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const negativeDir = path.join(root, 'backend', 'tests', 'negative');
const backendTests = readdirSync(negativeDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join(negativeDir, file));
const env = {
  ...process.env,
  ALERT_EMAIL_PROVIDER: 'console',
  ALERT_SMS_PROVIDER: 'console',
};

const backend = spawnSync(process.execPath, ['--test', ...backendTests], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (backend.error) throw backend.error;
if (backend.status !== 0) process.exit(backend.status || 1);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const frontend = spawnSync(npm, ['test', '--', 'src/lib/negative.test.js'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (frontend.error) throw frontend.error;
process.exit(frontend.status || 0);
