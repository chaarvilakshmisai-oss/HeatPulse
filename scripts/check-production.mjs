import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const previewPort = 4178;
const previewUrl = `http://127.0.0.1:${previewPort}/`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function findBrowser() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;

  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];

  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (found) return found;
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  for (const name of ['chrome', 'google-chrome', 'chromium', 'chromium-browser', 'msedge']) {
    const result = spawnSync(command, [name], { encoding: 'utf8', windowsHide: true });
    const candidate = result.stdout?.split(/\r?\n/).find(Boolean);
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome or Edge is required. Set CHROME_BIN to its executable to run this check.');
}

async function waitForPreview(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite preview exited early (${child.exitCode}).`);
    try {
      const response = await fetch(previewUrl);
      if (response.ok) return;
    } catch {
      // Wait for Vite preview to start listening.
    }
    await delay(200);
  }
  throw new Error('Vite preview did not become available within 15 seconds.');
}

async function main() {
  const browser = findBrowser();
  const profile = await mkdtemp(path.join(os.tmpdir(), 'heatpulse-production-check-'));
  const preview = spawn(process.execPath, [
    viteBin,
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
    '--strictPort',
  ], { cwd: root, stdio: 'ignore', windowsHide: true });

  try {
    await waitForPreview(preview);
    const result = spawnSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=6000',
      '--dump-dom',
      previewUrl,
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true,
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Headless browser exited with status ${result.status}: ${result.stderr || ''}`);
    }

    const html = result.stdout || '';
    const rootContents = html.match(/<div id="root">([\s\S]*?)<\/body>/)?.[1] || '';
    const appLoaded = rootContents.includes('Protect workers from heat stress')
      || rootContents.includes('Manager sign in')
      || rootContents.includes('Dashboard');
    if (!appLoaded || /global is not defined|Uncaught ReferenceError/.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error('Production preview did not render the frontend. Check the browser console and Vite bundle.');
    }
    console.log('Production preview loaded successfully in a headless browser.');
  } finally {
    preview.kill();
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
