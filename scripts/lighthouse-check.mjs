import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

let executablePath = process.env.EDGE_PATH;
if (!executablePath && process.platform === "win32") {
  const base = join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/EdgeCore");
  const versions = (await readdir(base).catch(() => [])).filter(v => /^\d/.test(v)).sort((a,b) => b.localeCompare(a,undefined,{numeric:true}));
  if (versions.length) executablePath = join(base, versions[0], "msedge.exe");
}
const port = Number(process.env.AUDIT_PORT ?? 9224);
const browser = await chromium.launch({ headless: true, executablePath, args: [`--remote-debugging-port=${port}`, "--no-first-run"] });
try {
  const result = await lighthouse(process.env.AUDIT_URL ?? "http://localhost:3001", { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/lighthouse.json", result.report);
  console.log(JSON.stringify({ scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([key,category]) => [key, Math.round(category.score * 100)])), metrics: Object.fromEntries(["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time"].map((key) => [key, result.lhr.audits[key].displayValue])), failures: Object.entries(result.lhr.audits).filter(([,audit]) => audit.score !== null && audit.score < 1 && audit.details && audit.details.type !== "opportunity").map(([key,audit]) => ({ key, title: audit.title, nodes: audit.details.items?.slice(0, 4).map((item) => item.node?.selector).filter(Boolean) })) }, null, 2));
} finally { await browser.close(); }
