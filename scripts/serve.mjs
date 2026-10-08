import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve("out");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    let body = await readFile(file);
    const headers = { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": url.pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache" };
    if (body.length > 1024 && /\btext\/|\bapplication\/json|\bimage\/svg/.test(headers["Content-Type"]) && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "")) {
      body = gzipSync(body); headers["Content-Encoding"] = "gzip"; headers.Vary = "Accept-Encoding";
    }
    response.writeHead(200, headers).end(body);
  } catch { response.writeHead(404, { "Content-Type": "text/plain" }).end("Page not found. Run pnpm build before starting the static preview."); }
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, "0.0.0.0", () => console.log(`Paper Crane is ready at http://localhost:${port}`));
