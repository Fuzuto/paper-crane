import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BASE_URL = process.env.QA_URL || 'http://localhost:3000';
const STORAGE_KEY = 'paper-crane.collection.v1';
const report = {
  url: BASE_URL, startedAt: new Date().toISOString(),
  isolation: 'Fresh temporary contexts. No user profiles or existing collection storage are opened.',
  checks: [], gestures: [], consoleErrors: [], networkErrors: [], accessibility: [],
  visualBaseline: 'INCONCLUSIVE: no committed visual regression baseline is available.',
};

async function edgePath() {
  if (process.env.EDGE_PATH) return process.env.EDGE_PATH;
  if (process.platform !== 'win32') return undefined;
  const root = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/EdgeCore');
  const versions = (await fs.readdir(root).catch(() => [])).filter((entry) => /^\d/.test(entry)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(root, version, 'msedge.exe');
    try { await fs.access(candidate); return candidate; } catch { /* Try another installed version. */ }
  }
  return undefined;
}

async function check(name, run) {
  const started = Date.now();
  try {
    const details = await run();
    report.checks.push({ name, status: 'PASS', durationMs: Date.now() - started, ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', durationMs: Date.now() - started, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message.slice(0, 1500)}`);
  }
}

async function fresh(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.consoleErrors.push({ kind: 'pageerror', message: error.message }));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push({ kind: 'console', message: message.text() }); });
  page.on('response', (response) => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(BASE_URL).origin) report.networkErrors.push({ url: response.url(), status: response.status() }); });
  return { context, page };
}

async function studio(page) {
  await page.goto(`${BASE_URL}/#studio`, { waitUntil: 'networkidle' });
  await foldCount(page, 0);
}

async function foldCount(page, count) {
  await page.locator(`.fold-dots[aria-label="${count} folds completed"]`).waitFor({ state: 'attached' });
}

async function points(page) {
  const handle = page.locator('.fold-grab-handle');
  await handle.waitFor({ state: 'visible' });
  await page.waitForFunction(() => { const handle = document.querySelector('.fold-grab-handle'); return handle && !handle.disabled && handle.getAttribute('aria-disabled') !== 'true'; });
  await handle.scrollIntoViewIfNeeded();
  // Native coordinate gestures must wait for Motion to paint the new fold's corner.
  await page.waitForFunction(() => {
    const handle = document.querySelector('.fold-grab-handle');
    const matrix = document.querySelector('.drag-fold-paper')?.getScreenCTM();
    if (!handle || !matrix) return false;
    const expected = new DOMPoint(Number(handle.dataset.startX), Number(handle.dataset.startY)).matrixTransform(matrix);
    const rect = handle.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return Math.hypot(x - expected.x, y - expected.y) < 1 && (hit === handle || handle.contains(hit));
  });
  const [button, paper, data] = await Promise.all([
    handle.boundingBox(), page.locator('.drag-fold-paper').boundingBox(),
    handle.evaluate((element) => ({ startX: Number(element.dataset.startX), startY: Number(element.dataset.startY), targetX: Number(element.dataset.targetX), targetY: Number(element.dataset.targetY) })),
  ]);
  assert.ok(button && paper, 'Paper and grab handle must be visible');
  assert.ok(Object.values(data).every(Number.isFinite), `Fold coordinates must be finite: ${JSON.stringify(data)}`);
  const start = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  const target = { x: start.x + (data.targetX - data.startX) / 400 * paper.width, y: start.y + (data.targetY - data.startY) / 400 * paper.height };
  assert.ok(Math.hypot(target.x - start.x, target.y - start.y) > 0, 'Each step needs a real movement');
  return { start, target, paper, data };
}

async function mouseStart(page, start) { await page.mouse.move(start.x, start.y); await page.mouse.down(); }
async function mouseMove(page, target) { await page.mouse.move(target.x, target.y, { steps: 10 }); }
async function progress(page) { return page.locator('.drag-fold-stage').evaluate((element) => Number(element.dataset.progress)); }
async function resetProgress(page) { await page.waitForFunction(() => Number(document.querySelector('.drag-fold-stage')?.dataset.progress) <= 0.001); }

async function touchInput(context, page) {
  const session = await context.newCDPSession(page);
  const point = ({ x, y }) => ({ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 });
  return {
    start: (location) => session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(location)] }),
    async move(start, target) {
      for (let index = 1; index <= 10; index++) {
        const fraction = index / 10;
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: start.x + (target.x - start.x) * fraction, y: start.y + (target.y - start.y) * fraction })] });
      }
    },
    end: () => session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    cancel: () => session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }),
  };
}

async function assertLayout(page, view) {
  const value = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(value.width <= value.viewport, `${view} overflows: ${value.width}px at ${value.viewport}px`);
}

async function accessibility(page, view) {
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => window.axe.run(document.querySelector('.site-shell'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  const violations = result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  report.accessibility.push({ view, violations });
  assert.equal(violations.length, 0, JSON.stringify(violations));
}

async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"version":1,"cranes":[]}').cranes, STORAGE_KEY);
}

async function keyboardFinish(page, from = 0) {
  for (let step = from; step < 12; step++) {
    const handle = page.locator('.fold-grab-handle');
    await page.waitForFunction(() => { const handle = document.querySelector('.fold-grab-handle'); return handle && !handle.disabled && handle.getAttribute('aria-disabled') !== 'true'; });
    await handle.focus();
    await handle.press('End');
    await handle.press('Enter');
    if (step < 11) await foldCount(page, step + 1);
  }
  await page.locator('.finish-space').waitFor();
}

async function noteForm(page) {
  if (!await page.locator('.wish-form').isVisible()) await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page.getByLabel('Name your crane', { exact: false }).waitFor();
}

const executablePath = await edgePath();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--disable-gpu-sandbox'] });
report.browser = await browser.version();
await fs.mkdir('artifacts', { recursive: true });
try {
  for (const [width, input] of [[375, 'touch'], [768, 'touch'], [1440, 'mouse']]) {
    await check(`All twelve ${input} folds at ${width}px follow movement and commit on release`, async () => {
      const { context, page } = await fresh(browser, { viewport: { width, height: width === 375 ? 812 : 1000 }, hasTouch: input === 'touch', reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
      try {
        await studio(page);
        const touch = input === 'touch' ? await touchInput(context, page) : null;
        for (let step = 0; step < 12; step++) {
          const { start, target, data } = await points(page);
          const middle = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 };
          if (touch) { await touch.start(start); await touch.move(start, middle); }
          else { await mouseStart(page, start); await mouseMove(page, middle); }
          const midpoint = await progress(page);
          assert.ok(midpoint > 0.25 && midpoint < 0.8, `Step ${step + 1} should follow halfway movement, observed ${midpoint}`);
          await foldCount(page, step);
          if (step === 0) await page.screenshot({ path: `artifacts/drag-${width}-midfold.png` });
          if (touch) await touch.move(middle, target); else await mouseMove(page, target);
          await foldCount(page, step);
          if (touch) await touch.end(); else await page.mouse.up();
          report.gestures.push({ width, input, step: step + 1, midpoint, start: [data.startX, data.startY], target: [data.targetX, data.targetY] });
          if (step < 11) await foldCount(page, step + 1);
        }
        await page.locator('.finish-space').waitFor();
        await assertLayout(page, 'wish');
        await page.getByRole('button', { name: 'Keep for later', exact: true }).click();
        await page.locator('.completion').waitFor();
        assert.equal((await stored(page)).length, 1);
        assert.equal((await stored(page))[0].wish, '');
        return { folds: 12, deferredNoteSaved: true, reducedMotion: width !== 1440 };
      } finally { await context.close(); }
    });
  }

  await check('Holding, partial release and off-axis release cannot complete a fold', async () => {
    const { context, page } = await fresh(browser);
    try {
      await studio(page);
      let gesture = await points(page);
      await mouseStart(page, gesture.start);
      await page.waitForTimeout(1300);
      assert.equal(await progress(page), 0);
      await page.mouse.up();
      await foldCount(page, 0);
      gesture = await points(page);
      await mouseStart(page, gesture.start);
      await mouseMove(page, { x: gesture.start.x + (gesture.target.x - gesture.start.x) * 0.45, y: gesture.start.y + (gesture.target.y - gesture.start.y) * 0.45 });
      assert.ok(await progress(page) > 0.2);
      await page.mouse.up();
      await resetProgress(page);
      await foldCount(page, 0);
      gesture = await points(page);
      const dx = gesture.target.x - gesture.start.x;
      const dy = gesture.target.y - gesture.start.y;
      const length = Math.hypot(dx, dy);
      await mouseStart(page, gesture.start);
      await mouseMove(page, { x: gesture.target.x - dy / length * gesture.paper.width * 0.23, y: gesture.target.y + dx / length * gesture.paper.width * 0.23 });
      await page.mouse.up();
      await resetProgress(page);
      await foldCount(page, 0);
      gesture = await points(page);
      await mouseStart(page, gesture.start);
      await mouseMove(page, gesture.target);
      await page.waitForTimeout(1100);
      await foldCount(page, 0);
      await page.mouse.up();
      await foldCount(page, 1);
      await page.getByRole('button', { name: 'Undo fold', exact: true }).click();
      await foldCount(page, 0);
      await resetProgress(page);
      await page.getByRole('button', { name: 'Start over', exact: true }).click();
      await foldCount(page, 0);
      return { stationaryHoldMs: 1300, readyHoldMs: 1100, undoAndRestart: true };
    } finally { await context.close(); }
  });

  await check('Native touch cancellation resets paper and allows a fresh gesture', async () => {
    const { context, page } = await fresh(browser, { viewport: { width: 375, height: 812 }, hasTouch: true });
    try {
      await studio(page);
      const touch = await touchInput(context, page);
      let gesture = await points(page);
      await touch.start(gesture.start);
      await touch.move(gesture.start, gesture.target);
      await touch.cancel();
      await resetProgress(page);
      await foldCount(page, 0);
      gesture = await points(page);
      await touch.start(gesture.start);
      await touch.move(gesture.start, gesture.target);
      await touch.end();
      await foldCount(page, 1);
      await assertLayout(page, 'folding');
    } finally { await context.close(); }
  });

  await check('Keyboard controls require positioning, support reset, and complete the journey', async () => {
    const { context, page } = await fresh(browser);
    try {
      await studio(page);
      const handle = page.locator('.fold-grab-handle');
      await handle.focus();
      await handle.press('Enter');
      await foldCount(page, 0);
      await handle.press('ArrowRight');
      assert.ok(await progress(page) > 0 && await progress(page) < 0.3);
      await handle.press('Enter');
      await foldCount(page, 0);
      await handle.press('Escape');
      await resetProgress(page);
      await handle.press('End');
      assert.ok(await progress(page) >= 0.96);
      await handle.press('Home');
      await resetProgress(page);
      await accessibility(page, 'drag-folding');
      await keyboardFinish(page);
      await page.getByRole('button', { name: 'Return to the last fold', exact: true }).click();
      await foldCount(page, 11);
      await keyboardFinish(page, 11);
      await page.getByRole('button', { name: 'Keep for later', exact: true }).click();
      await page.locator('.completion').waitFor();
      assert.equal((await stored(page)).length, 1);
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    } finally { await context.close(); }
  });

  await check('Skip name and wish, then add and edit them later without duplicating the crane', async () => {
    const { context, page } = await fresh(browser, { viewport: { width: 375, height: 812 } });
    try {
      await studio(page);
      await keyboardFinish(page);
      await page.getByRole('button', { name: 'Keep for later', exact: true }).click();
      await page.locator('.completion').waitFor();
      let cranes = await stored(page);
      assert.equal(cranes.length, 1);
      const original = cranes[0];
      assert.equal(original.name, 'Rice paper crane');
      assert.equal(original.wish, '');
      assert.equal(original.visibility, 'private');
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^My collection/ }).click();
      await page.getByRole('button', { name: `Open ${original.name}`, exact: true }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Add a wish', exact: true }).click();
      await dialog.getByLabel('Name your crane', { exact: false }).fill('Discard this draft');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal((await stored(page))[0].name, original.name);
      await dialog.getByRole('button', { name: 'Add a wish', exact: true }).click();
      await dialog.getByLabel('Name your crane', { exact: false }).fill('  A later hope  ');
      await dialog.getByLabel('Your wish', { exact: false }).fill('  A little meaning, whenever I am ready.  ');
      await dialog.getByRole('radio', { name: 'Open to sharing', exact: true }).check();
      await accessibility(page, 'deferred-note-editor');
      await assertLayout(page, 'note editor');
      await page.screenshot({ path: 'artifacts/note-editor-mobile.png' });
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await dialog.getByRole('heading', { name: 'A later hope', exact: true }).last().waitFor();
      cranes = await stored(page);
      assert.equal(cranes.length, 1);
      assert.deepEqual({ name: cranes[0].name, wish: cranes[0].wish, visibility: cranes[0].visibility }, { name: 'A later hope', wish: 'A little meaning, whenever I am ready.', visibility: 'public' });
      assert.equal(cranes[0].id, original.id);
      assert.equal(cranes[0].createdAt, original.createdAt);
      assert.equal(cranes[0].folds, 12);
      await dialog.getByRole('button', { name: 'Edit details', exact: true }).click();
      await dialog.getByLabel('Name your crane', { exact: false }).fill('');
      await dialog.getByLabel('Your wish', { exact: false }).fill('A second thought.');
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      assert.equal((await stored(page))[0].name, 'A later hope');
      await dialog.getByRole('button', { name: 'Close crane details', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open A later hope', exact: true }).click();
      dialog = page.getByRole('dialog');
      assert.ok((await dialog.innerText()).includes('A second thought.'));
      assert.equal((await stored(page)).length, 1);
      return { idPreserved: true, createdAtPreserved: true, persistsAfterReload: true };
    } finally { await context.close(); }
  });

  await check('Blank regular save works and later editing recovers from full browser storage', async () => {
    const { context, page } = await fresh(browser);
    try {
      await studio(page);
      await keyboardFinish(page);
      await noteForm(page);
      await page.getByLabel('Name your crane', { exact: false }).fill('   ');
      await page.getByRole('button', { name: 'Keep my crane', exact: true }).click();
      await page.locator('.completion').waitFor();
      const original = (await stored(page))[0];
      assert.equal(original.name, 'Rice paper crane');
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^My collection/ }).click();
      await page.getByRole('button', { name: 'Open Rice paper crane', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Add a wish', exact: true }).click();
      await dialog.getByLabel('Name your crane', { exact: false }).fill('A patient wish');
      await dialog.getByLabel('Your wish', { exact: false }).fill('There is still room for hope.');
      await page.evaluate((key) => {
        const nativeSetItem = Storage.prototype.setItem;
        window.__qaEditQuotaFailure = true;
        Storage.prototype.setItem = function (storageKey, value) {
          if (storageKey === key && window.__qaEditQuotaFailure) throw new DOMException('Test quota exhausted', 'QuotaExceededError');
          return nativeSetItem.call(this, storageKey, value);
        };
      }, STORAGE_KEY);
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      assert.equal((await stored(page))[0].name, original.name);
      assert.equal(await dialog.getByLabel('Name your crane', { exact: false }).inputValue(), 'A patient wish');
      assert.equal(await dialog.getByLabel('Your wish', { exact: false }).inputValue(), 'There is still room for hope.');
      await page.evaluate(() => { window.__qaEditQuotaFailure = false; });
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await dialog.getByRole('heading', { name: 'A patient wish', exact: true }).last().waitFor();
      const saved = await stored(page);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].id, original.id);
      assert.equal(saved[0].wish, 'There is still room for hope.');
    } finally { await context.close(); }
  });

  await check('No uncaught browser errors or local HTTP failures', async () => {
    assert.equal(report.consoleErrors.length, 0, JSON.stringify(report.consoleErrors));
    assert.equal(report.networkErrors.length, 0, JSON.stringify(report.networkErrors));
  });
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.checks.filter((entry) => entry.status === 'PASS').length, failed: report.checks.filter((entry) => entry.status === 'FAIL').length, gestures: report.gestures.length, axeViolations: report.accessibility.reduce((sum, entry) => sum + entry.violations.length, 0) };
  await fs.writeFile('artifacts/qa-drag.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed) process.exitCode = 1;
}
