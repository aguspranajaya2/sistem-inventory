import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { itCategories } from "../web/catalog.js";

const source = new URL("../", import.meta.url);
const read = (name) => readFile(new URL(name, source), "utf8");
const assets = {};
for (const [name, type] of Object.entries({
  "index.html": "text/html; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "reports.js": "text/javascript; charset=utf-8",
  "demo.js": "text/javascript; charset=utf-8",
  "catalog.js": "text/javascript; charset=utf-8",
  "mark.svg": "image/svg+xml"
})) {
  assets[name === "index.html" ? "/" : "/" + name] = { type, body: await read("web/" + name) };
}
await mkdir(new URL("dist/server/", source), { recursive: true });
await mkdir(new URL("dist/.openai/", source), { recursive: true });
await writeFile(new URL("dist/server/index.js", source),
  (await read("worker/index.js"))
    .replace("/* IT_CATEGORIES */ []", () => JSON.stringify(itCategories))
    .replace("/* ASSETS */ {}", () => JSON.stringify(assets)));
await copyFile(new URL(".openai/hosting.json", source), new URL("dist/.openai/hosting.json", source));
