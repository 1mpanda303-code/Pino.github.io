import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 5176;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  await wait(1200);
  mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '云同步' }).click();
    await page.getByRole('heading', { name: '云同步' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) throw new Error(`${viewport.name} has horizontal overflow`);
    await page.screenshot({ path: `artifacts/sync-${viewport.name}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log('Sync UI visual check passed');
} finally {
  server.kill();
}
