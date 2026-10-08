import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { join } from 'node:path';
let executablePath = process.env.EDGE_PATH;
if (!executablePath && process.platform === 'win32') {
  const base = join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/EdgeCore');
  const versions = (await fs.readdir(base).catch(() => [])).filter(v => /^\d/.test(v)).sort((a,b) => b.localeCompare(a,undefined,{numeric:true}));
  if (versions.length) executablePath = join(base, versions[0], 'msedge.exe');
}
await fs.mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({headless: true, executablePath});
const report = [];
for (const [name, width, height] of [['desktop',1440,1000],['mobile',390,844],['tablet',768,1024]]) {
  const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:1});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.QA_URL || 'http://localhost:3000', {waitUntil:'networkidle'});
  await page.waitForTimeout(1700);
  await page.screenshot({path:`artifacts/${name}.png`,fullPage:false});
  const layout = await page.evaluate(() => ({documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,canvasCount:document.querySelectorAll('canvas').length,headings:[...document.querySelectorAll('h1')].map(el=>el.textContent)}));
  report.push({name,...layout,errors});
  await context.close();
}
await browser.close();
await fs.writeFile('artifacts/visual-report.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

