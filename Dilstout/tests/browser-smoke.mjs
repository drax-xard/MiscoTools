import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 8123);
const baseUrl = process.env.DILSTOUT_URL ?? `http://127.0.0.1:${port}`;
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const root = fileURLToPath(new URL('..', import.meta.url));

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core'));
} catch {
  console.error(
    'browser-smoke needs playwright-core. Install it outside the app, then point PLAYWRIGHT_CORE at its index.mjs.',
  );
  process.exit(2);
}

async function waitForServer(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Server did not start at ${url}`);
}

const server = spawn('python3', ['-m', 'http.server', String(port)], {
  cwd: root,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /Dilstout/);
  assert.equal(await page.locator('#mix-list .pack-card').count(), 2);
  assert.equal(await page.locator('#banner').isHidden(), true);

  await page.selectOption('#category-select', 'person');
  await page.fill('#count-input', '5');
  await page.click('#generate');
  await page.waitForFunction(() => document.querySelectorAll('#results .result-card').length === 5);
  const names = await page.locator('#results .result-card h3').allTextContents();
  assert.equal(new Set(names).size, 5);
  assert.equal(await page.locator('#result-toolbar').isHidden(), false);

  await page.locator('#results .result-card').first().locator('summary').click();
  assert.ok((await page.locator('#results .result-card').first().locator('.provenance-table tbody tr').count()) > 0);

  await page.click('[data-tab="gallery"]');
  await page.fill('#preset-name', 'Smoke preset');
  await page.click('#save-preset');
  await page.waitForSelector('#saved-presets .preset-card', { timeout: 5000 });
  assert.ok((await page.locator('#saved-presets').innerText()).includes('Smoke preset'));

  const presetDownload = page.waitForEvent('download');
  await page.click('#export-preset');
  assert.match((await presetDownload).suggestedFilename(), /\.lpp$/);

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-tab="gallery"]');
  await page.waitForSelector('#saved-presets .preset-card', { timeout: 5000 });
  await page
    .locator('#saved-presets .preset-card')
    .filter({ hasText: 'Smoke preset' })
    .first()
    .locator('button', { hasText: 'Load' })
    .click();
  await page.waitForSelector('#mix-list .pack-card');
  assert.equal(await page.locator('#panel-workspace').isHidden(), false);

  await page.click('[data-tab="studio"]');
  await page.waitForSelector('#studio-form .studio-section');
  await page.waitForFunction(() => document.querySelector('#studio-preview').innerText.length > 0);
  assert.match(await page.locator('#studio-validation').innerText(), /valid/i);
  const previewNames = await page.locator('#studio-preview .preview-list li').allTextContents();
  assert.ok(previewNames.length > 0);
  assert.equal(new Set(previewNames).size, previewNames.length);

  const lapDownload = page.waitForEvent('download');
  await page.click('#studio-export');
  assert.match((await lapDownload).suggestedFilename(), /\.lap$/);

  await page.click('#studio-import-toggle');
  await page.selectOption('#studio-import-target', 'person.given.neutral');
  await page.fill('#studio-import-text', 'Zeta\nOmicron');
  await page.click('#studio-import-append');
  assert.match(await page.locator('#studio-import-status').innerText(), /Added 2 entries/);

  await page.click('#studio-add-mix');
  await page.waitForFunction(() => document.querySelectorAll('#mix-list .pack-card').length === 3);

  await page.click('[data-tab="plugins"]');
  await page.waitForSelector('#plugin-list .plugin-card');
  assert.ok((await page.locator('#plugin-list').innerText()).includes('Example Hooks'));
  assert.match(await page.locator('#plugin-api-version').innerText(), /API v1/i);
  assert.ok((await page.locator('#plugin-panels').innerText()).includes('Example Hooks'));

  await page.locator('#plugin-panels button', { hasText: 'Select Syllable chant' }).click();
  await page.waitForSelector('#panel-workspace:not([hidden])');
  assert.equal(await page.inputValue('#category-select'), 'syllable-chant');
  await page.fill('#count-input', '5');
  await page.click('#generate');
  await page.waitForFunction(() => document.querySelectorAll('#results .result-card').length === 5);
  const pluginNames = await page.locator('#results .result-card h3').allTextContents();
  console.log('plugin category names:', pluginNames.join(' | '));

  const markdownDownload = page.waitForEvent('download');
  await page.locator('#plugin-exporters button', { hasText: 'Markdown' }).click();
  assert.match((await markdownDownload).suggestedFilename(), /\.md$/);

  const localPlugin = `
export const manifest = {
  format: 'dilstout.plugin', id: 'local-demo', name: 'Local Demo', version: '0.1.0',
  apiVersion: 1, entry: 'local-demo.js', capabilities: ['uiPanel'],
  description: 'Loaded from a local file during the smoke test.'
};
export function register({ registry }) {
  registry.uiPanels.register('local-demo.panel', {
    id: 'local-demo.panel', label: 'Local Demo',
    mount(root) { root.textContent = 'Local plugin panel loaded.'; }
  });
}
`;
  await page.click('[data-tab="plugins"]');
  await page.setInputFiles('#plugin-file', {
    name: 'local-demo.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(localPlugin),
  });
  await page.waitForFunction(() => document.querySelector('#plugin-list').innerText.includes('Local Demo'));
  assert.ok((await page.locator('#plugin-panels').innerText()).includes('Local plugin panel loaded.'));

  const badPlugin = `
export const manifest = {
  format: 'dilstout.plugin', id: 'future-plugin', name: 'Future Plugin', version: '1.0.0',
  apiVersion: 2, entry: 'future.js', capabilities: ['uiPanel']
};
export function register() {}
`;
  await page.setInputFiles('#plugin-file', {
    name: 'future-plugin.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(badPlugin),
  });
  await page.waitForFunction(() => document.querySelector('#toast').innerText.includes('supports v1'));
  assert.equal(await page.locator('#plugin-list .plugin-card').count(), 2);

  assert.deepEqual(errors, []);
  console.log(`browser smoke OK: ${names.join(' | ')}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
