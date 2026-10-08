import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BASE_URL = process.env.QA_URL || 'http://localhost:3000';
const STORAGE_KEY = 'paper-crane.collection.v1';
const outputPath = path.resolve('artifacts/qa-flow.json');
const report = {
  url: BASE_URL,
  startedAt: new Date().toISOString(),
  isolation: 'Fresh, temporary browser contexts; no existing browser profiles or user storage opened.',
  checks: [], layouts: [], accessibility: [], consoleErrors: [], networkErrors: [],
  visualBaseline: 'INCONCLUSIVE: no committed visual regression baseline is available.',
};

async function edgePath() {
  if (process.env.EDGE_PATH) return process.env.EDGE_PATH;
  if (process.platform !== 'win32') return undefined;
  const programFiles = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const root = path.join(programFiles, 'Microsoft/EdgeCore');
  try {
    const entries = (await fs.readdir(root)).filter((name) => /^\d/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const entry of entries) {
      const candidate = path.join(root, entry, 'msedge.exe');
      try { await fs.access(candidate); return candidate; } catch { /* Try another installed version. */ }
    }
  } catch { /* A Playwright browser can be used on other installations. */ }
  return undefined;
}

async function check(name, task) {
  const started = Date.now();
  try {
    const details = await task();
    report.checks.push({ name, status: 'PASS', durationMs: Date.now() - started, ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', durationMs: Date.now() - started, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message.slice(0, 1500)}`);
  }
}

async function contextPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.consoleErrors.push({ url: page.url(), kind: 'pageerror', message: error.message }));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push({ url: page.url(), kind: 'console', message: message.text() }); });
  page.on('response', (response) => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(BASE_URL).origin) report.networkErrors.push({ url: response.url(), status: response.status() }); });
  return { context, page };
}

async function open(page, hash = '') {
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'networkidle' });
  await page.locator('.site-header').waitFor();
}

async function enabled(locator) {
  await locator.waitFor({ state: 'visible' });
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await locator.page().waitForTimeout(40);
  }
  throw new Error('Control remained disabled: ' + await locator.textContent());
}

async function foldCount(page, count) {
  await page.locator(`.fold-dots[aria-label="${count} folds completed"]`).waitFor();
}

async function keyboardFold(page) {
  const button = page.locator('.fold-grab-handle');
  await enabled(button);
  await button.focus();
  await button.press('End');
  await button.press('Enter');
}

async function dragPoints(page) {
  const handle = page.locator('.fold-grab-handle');
  await enabled(handle);
  await handle.scrollIntoViewIfNeeded();
  const [button, paper, data] = await Promise.all([
    handle.boundingBox(), page.locator('.drag-fold-paper').boundingBox(),
    handle.evaluate((element) => ({ startX: Number(element.dataset.startX), startY: Number(element.dataset.startY), targetX: Number(element.dataset.targetX), targetY: Number(element.dataset.targetY) })),
  ]);
  assert.ok(button && paper, 'Fold handle and paper must have visible dimensions');
  const start = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  return { start, target: { x: start.x + (data.targetX - data.startX) / 400 * paper.width, y: start.y + (data.targetY - data.startY) / 400 * paper.height } };
}

async function pointerFold(page, fraction = 1) {
  const { start, target } = await dragPoints(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (target.x - start.x) * fraction, start.y + (target.y - start.y) * fraction, { steps: 12 });
  await page.mouse.up();
}

async function finishFolds(page, remaining = 12) {
  const start = Number((await page.locator('.fold-dots').getAttribute('aria-label')).match(/^\d+/)[0]);
  for (let i = 0; i < remaining; i++) {
    await keyboardFold(page);
    if (start + i + 1 < 12) await foldCount(page, start + i + 1);
  }
  await page.getByLabel('Name your crane').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'crane-name');
}

async function newPaper(page, color = 'Matcha', pattern = 'Ocean waves') {
  await page.locator('.hero-actions .primary').click();
  await page.getByRole('button', { name: color, exact: true }).click();
  await page.getByRole('button', { name: pattern, exact: true }).click();
  await layout(page, 'paper', page.viewportSize().width);
  await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
  await foldCount(page, 0);
}

async function writeWish(page, name, wish, visibility = 'private') {
  await page.getByLabel('Name your crane').fill(name);
  await page.getByLabel('Your wish', { exact: false }).fill(wish);
  await page.getByRole('radio', { name: visibility === 'private' ? 'Just me' : 'Open to sharing', exact: true }).check();
  await page.getByRole('button', { name: 'Keep my crane', exact: true }).click();
}

async function collection(page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^My collection/ }).click();
  await page.locator('.collection').waitFor();
}

async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"version":1,"cranes":[]}').cranes, STORAGE_KEY);
}

async function layout(page, view, width) {
  const value = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  report.layouts.push({ view, width, ...value });
  assert.ok(value.documentWidth <= value.viewport, `${view} overflows: ${value.documentWidth}px at ${value.viewport}px`);
}

async function axe(page, view) {
  await page.waitForTimeout(900);
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => window.axe.run(document.querySelector('.site-shell'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  const violations = result.violations.map(({ id, impact, description, help, helpUrl, nodes }) => ({ id, impact, description, help, helpUrl, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  report.accessibility.push({ view, violationCount: violations.length, violations });
}

const executablePath = await edgePath();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--disable-gpu-sandbox'] });
report.browser = await browser.version();
try {
  for (const width of [375, 768, 1440]) {
    await check(`Responsive journey at ${width}px`, async () => {
      const { context, page } = await contextPage(browser, { viewport: { width, height: width === 375 ? 812 : 1000 }, reducedMotion: 'reduce' });
      try {
        await open(page);
        await layout(page, 'home', width);
        await newPaper(page);
        await layout(page, 'folding', width);
        await finishFolds(page);
        await layout(page, 'wish', width);
        await writeWish(page, `Responsive ${width}`, 'A little space for hope.');
        await page.locator('.completion').waitFor();
        await layout(page, 'complete', width);
        await collection(page);
        await layout(page, 'collection', width);
        await page.getByRole('button', { name: `Open Responsive ${width}`, exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await layout(page, 'details', width);
        assert.ok(await page.getByRole('dialog').isVisible());
      } finally { await context.close(); }
    });
  }

  const journey = await contextPage(browser);
  const page = journey.page;
  try {
    await check('Initial home, paper selection, sound and accessibility', async () => {
      await open(page);
      assert.equal((await stored(page)).length, 0);
      await axe(page, 'home');
      const sound = page.getByRole('button', { name: /Turn on ambient sound$/ });
      await sound.click();
      await page.getByRole('button', { name: /Turn off ambient sound$/ }).waitFor();
      await page.getByRole('button', { name: /Turn off ambient sound$/ }).click();
      await page.locator('.header-cta').click();
      await page.getByRole('button', { name: 'Matcha', exact: true }).click();
      await page.getByRole('button', { name: 'Ocean waves', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Matcha', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Ocean waves', exact: true }).getAttribute('aria-pressed'), 'true');
      await axe(page, 'paper');
    });

    await check('Stationary hold and partial drag do not fold; full drag, undo and restart work', async () => {
      await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
      await foldCount(page, 0);
      await axe(page, 'folding');
      const { start } = await dragPoints(page);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.waitForTimeout(1150);
      await page.mouse.up();
      await page.waitForTimeout(200);
      await foldCount(page, 0);
      await pointerFold(page, 0.45);
      await page.waitForTimeout(200);
      await foldCount(page, 0);
      await pointerFold(page);
      await foldCount(page, 1);
      const undo = page.getByRole('button', { name: 'Undo fold', exact: true });
      await enabled(undo);
      await undo.click();
      await foldCount(page, 0);
      await pointerFold(page);
      await foldCount(page, 1);
      await keyboardFold(page);
      await foldCount(page, 2);
      await page.getByRole('button', { name: 'Start over', exact: true }).click();
      await page.getByRole('button', { name: 'Begin folding', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Matcha', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Ocean waves', exact: true }).getAttribute('aria-pressed'), 'true');
    });

    await check('Twelve keyboard folds, wish undo, optional name and private save', async () => {
      await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
      await finishFolds(page);
      assert.equal(await page.getByLabel('Name your crane').evaluate((el) => el === document.activeElement), true, 'Wish input was not focused after finishing');
      assert.equal(await page.getByRole('button', { name: 'Keep my crane', exact: true }).isEnabled(), true);
      await page.getByLabel('Name your crane').fill('   ');
      assert.equal(await page.getByRole('button', { name: 'Keep my crane', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'Return to the last fold', exact: true }).click();
      await foldCount(page, 11);
      await finishFolds(page, 1);
      await axe(page, 'wish');
      await writeWish(page, '  Morning calm  ', 'For a calm morning & a little kindness <3', 'private');
      await page.locator('.completion').waitFor();
      await page.waitForFunction(() => document.activeElement?.matches('.completion h1'));
      const cranes = await stored(page);
      assert.equal(cranes.length, 1);
      assert.deepEqual({ name: cranes[0].name, wish: cranes[0].wish, visibility: cranes[0].visibility, color: cranes[0].color, pattern: cranes[0].pattern, folds: cranes[0].folds }, { name: 'Morning calm', wish: 'For a calm morning & a little kindness <3', visibility: 'private', color: 'sage', pattern: 'seigaiha', folds: 12 });
      assert.ok(await page.locator('.milestone-reward').isVisible());
      await axe(page, 'complete');
    });

    await check('Second crane with public preference, saved locally', async () => {
      await page.getByRole('button', { name: 'Fold another', exact: true }).click();
      await page.getByRole('button', { name: 'Morning sky', exact: true }).click();
      await page.getByRole('button', { name: 'Paper flecks', exact: true }).click();
      await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
      await finishFolds(page);
      await page.getByRole('radio', { name: 'Open to sharing', exact: true }).check();
      assert.match(await page.locator('.privacy-note').innerText(), /does not publish/);
      await writeWish(page, 'Kindness for someone', 'May kindness find its way to you.', 'public');
      await page.locator('.completion').waitFor();
      const cranes = await stored(page);
      assert.equal(cranes.length, 2);
      assert.equal(cranes[0].visibility, 'public');
      assert.equal(cranes[0].color, 'sky');
      assert.equal(cranes[0].pattern, 'speckled');
    });

    await check('Collection persistence, sorting, filtering, details and backup', async () => {
      await collection(page);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.crane-card').first().waitFor();
      assert.equal(await page.locator('.crane-card').count(), 2);
      assert.deepEqual(await page.locator('.crane-card h3').allTextContents(), ['Kindness for someone', 'Morning calm']);
      await page.getByLabel('Sort cranes').selectOption('oldest');
      assert.deepEqual(await page.locator('.crane-card h3').allTextContents(), ['Morning calm', 'Kindness for someone']);
      const filters = page.getByRole('group', { name: 'Filter cranes' });
      await filters.getByRole('button', { name: 'Just me', exact: true }).click();
      assert.deepEqual(await page.locator('.crane-card h3').allTextContents(), ['Morning calm']);
      await filters.getByRole('button', { name: 'Open to sharing', exact: true }).click();
      assert.deepEqual(await page.locator('.crane-card h3').allTextContents(), ['Kindness for someone']);
      await filters.getByRole('button', { name: 'All cranes', exact: true }).click();
      await axe(page, 'collection');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download collection backup', exact: true }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'paper-crane-collection.json');
      const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(backup.version, 1);
      assert.equal(backup.cranes.length, 2);
      const trigger = page.getByRole('button', { name: 'Open Morning calm', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('For a calm morning & a little kindness <3'));
      await axe(page, 'details');
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !document.hasFocus() || !!document.activeElement?.closest('dialog')), true, 'Dialog focus moved to other page content');
        assert.equal(await dialog.evaluate((element) => element.matches(':modal')), true);
      }
      await dialog.getByRole('button', { name: 'Close crane details', exact: true }).focus();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true, 'Dialog did not restore trigger focus');
      return { backupCranes: backup.cranes.length };
    });

    await check('Deletion confirmation, cancel, confirmed removal and journey count', async () => {
      await page.getByRole('button', { name: 'Open Kindness for someone', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      assert.equal((await stored(page)).length, 2);
      await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();
      assert.equal((await stored(page)).length, 2);
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.crane-card').count(), 1);
      assert.equal((await stored(page)).length, 1);
      await page.getByRole('button', { name: '1,000 cranes', exact: true }).click();
      await page.locator('#journey').waitFor();
      assert.equal(await page.getByRole('progressbar', { name: 'Thousand cranes journey' }).getAttribute('aria-valuenow'), '1');
    });
  } finally { await journey.context.close(); }

  await check('Direct section links, studio/collection URLs and browser history', async () => {
    const { context, page } = await contextPage(browser, { reducedMotion: 'reduce' });
    try {
      await open(page, '#collection');
      await page.locator('.collection').waitFor();
      await page.locator('.header-cta').click();
      await page.getByRole('button', { name: 'Begin folding', exact: true }).waitFor();
      assert.match(page.url(), /#studio$/);
      await page.getByRole('button', { name: 'The experience', exact: true }).click();
      await page.locator('#how-it-works').waitFor();
      await page.goBack();
      await page.getByRole('button', { name: 'Begin folding', exact: true }).waitFor();
      await page.goBack();
      await page.locator('.collection').waitFor();
      await open(page, '#studio');
      await page.getByRole('button', { name: 'Begin folding', exact: true }).waitFor();
      await open(page, '#journey');
      await page.getByRole('progressbar', { name: 'Thousand cranes journey' }).waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'journey');
      const position = await page.locator('#journey').evaluate((el) => ({ top: el.getBoundingClientRect().top, pageY: scrollY }));
      assert.ok(position.pageY > 0 && position.top < 600, `Direct journey anchor was not scrolled into view: ${JSON.stringify(position)}`);
      assert.equal(await page.locator('#journey').evaluate((el) => el === document.activeElement), true, 'Direct journey anchor was not focused');
      return { directAnchorPosition: position };
    } finally { await context.close(); }
  });

  await check('Reduced motion preference removes ambient CSS animation', async () => {
    const { context, page } = await contextPage(browser, { reducedMotion: 'reduce' });
    try {
      await open(page);
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      const animations = await page.locator('.hero-crane, .floating-crane').evaluateAll((elements) => elements.map((el) => ({ className: el.className, animationName: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration })));
      assert.ok(animations.every((animation) => animation.animationName === 'none' || parseFloat(animation.duration) <= 0.01), JSON.stringify(animations));
      return animations;
    } finally { await context.close(); }
  });

  await check('Corrupt collection is preserved and save remains recoverable', async () => {
    const { context, page } = await contextPage(browser, { reducedMotion: 'reduce' });
    try {
      await context.addInitScript((key) => { localStorage.setItem(key, '{not valid JSON'); }, STORAGE_KEY);
      await open(page, '#studio');
      await page.locator('.error-banner[role="alert"]').waitFor();
      assert.match(await page.locator('.error-banner[role="alert"]').innerText(), /preserved/);
      await collection(page);
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('heading', { name: 'Your collection needs a moment.', exact: true }).waitFor();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), '{not valid JSON');
      await page.locator('.header-cta').click();
      await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
      await finishFolds(page);
      await writeWish(page, 'Preserved intention', 'My wish remains available to retry.');
      await page.locator('.error-banner[role="alert"]').waitFor();
      assert.equal(await page.getByLabel('Name your crane').inputValue(), 'Preserved intention');
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), '{not valid JSON');
      await page.evaluate((key) => { localStorage.removeItem(key); dispatchEvent(new StorageEvent('storage', { key, newValue: null })); }, STORAGE_KEY);
      await page.getByRole('button', { name: 'Keep my crane', exact: true }).click();
      await page.locator('.completion').waitFor();
      assert.equal((await stored(page)).length, 1);
      return { malformedDataPreserved: true, retryAfterSimulatedStorageRepair: true };
    } finally { await context.close(); }
  });

  await check('Storage quota errors preserve wishes/cranes and save/delete retries recover', async () => {
    const { context, page } = await contextPage(browser, { reducedMotion: 'reduce' });
    try {
      await context.addInitScript((key) => {
        const nativeSetItem = Storage.prototype.setItem;
        window.__qaQuotaFailure = true;
        Storage.prototype.setItem = function (storageKey, value) {
          if (storageKey === key && window.__qaQuotaFailure) throw new DOMException('Test quota exhausted', 'QuotaExceededError');
          return nativeSetItem.call(this, storageKey, value);
        };
      }, STORAGE_KEY);
      await open(page, '#studio');
      await page.getByRole('button', { name: 'Begin folding', exact: true }).click();
      await finishFolds(page);
      await writeWish(page, 'Try again gently', 'A little patience is enough.');
      await page.locator('.error-banner[role="alert"]').waitFor();
      assert.match(await page.locator('.error-banner[role="alert"]').innerText(), /storage is full/);
      assert.equal((await stored(page)).length, 0);
      assert.equal(await page.getByLabel('Name your crane').inputValue(), 'Try again gently');
      assert.equal(await page.getByLabel('Your wish', { exact: false }).inputValue(), 'A little patience is enough.');
      await page.evaluate(() => { window.__qaQuotaFailure = false; });
      await page.getByRole('button', { name: 'Keep my crane', exact: true }).click();
      await page.locator('.completion').waitFor();
      assert.equal((await stored(page)).length, 1);
      assert.equal(await page.locator('.error-banner[role="alert"]').count(), 0);
      await collection(page);
      await page.getByRole('button', { name: 'Open Try again gently', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await page.evaluate(() => { window.__qaQuotaFailure = true; });
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      assert.match(await dialog.getByRole('alert').innerText(), /storage is full/);
      assert.equal((await stored(page)).length, 1);
      await page.evaluate(() => { window.__qaQuotaFailure = false; });
      await dialog.getByRole('button', { name: 'Remove crane', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await stored(page)).length, 0);
    } finally { await context.close(); }
  });

  await check('Automated WCAG accessibility checks', async () => {
    const violations = report.accessibility.flatMap((entry) => entry.violations.map((violation) => ({ view: entry.view, ...violation })));
    assert.equal(violations.length, 0, JSON.stringify(violations));
  });

  await check('No uncaught browser errors or local HTTP failures', async () => {
    assert.equal(report.consoleErrors.length, 0, JSON.stringify(report.consoleErrors));
    assert.equal(report.networkErrors.length, 0, JSON.stringify(report.networkErrors));
  });
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter((check) => check.status === 'PASS').length, failed: report.checks.filter((check) => check.status === 'FAIL').length, axeViolations: report.accessibility.reduce((count, entry) => count + entry.violationCount, 0) };
  report.verdict = report.summary.failed ? 'DO NOT SHIP' : 'SHIP: functional and automated accessibility checks pass; visual baseline comparison remains inconclusive.';
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed) process.exitCode = 1;
}
