import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export function createDocsSite() {
  const require = createRequire(import.meta.url);
  let server;
  let origin;
  let browser;
  before(async () => {
    await new Promise((resolve, reject) => {
      server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '0'], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '';
      const timeout = setTimeout(() => reject(new Error(`Docs server did not start:\n${log}`)), 20_000);
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`Docs server exited with ${code}:\n${log}`));
      });
      const onData = chunk => {
        log += chunk.toString();
        const address = log.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (address && log.includes('Ready in')) {
          origin = address[0];
          clearTimeout(timeout);
          resolve();
        }
      };
      server.stdout.on('data', onData);
      server.stderr.on('data', onData);
    });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    await new Promise(resolve => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
    });
  });
  return {
    get origin() { return origin; },
    get browser() { return browser; },
    request: pathname => fetch(`${origin}${pathname}`, { signal: AbortSignal.timeout(10_000) }),
  };
}
