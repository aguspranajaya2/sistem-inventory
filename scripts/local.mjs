import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import worker from "../dist/server/index.js";

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const database = new DatabaseSync(process.env.RUANG_STOK_EPHEMERAL === "1" ? ":memory:" : new URL("../data/inventory.sqlite", import.meta.url));
database.exec("PRAGMA foreign_keys = ON");
const migrations = new URL("../drizzle/", import.meta.url);
const { entries } = JSON.parse(readFileSync(new URL("meta/_journal.json", migrations), "utf8"));
database.exec("BEGIN IMMEDIATE");
try {
  const { user_version: version } = database.prepare("PRAGMA user_version").get();
  if (version > entries.length) throw new Error("Versi basis data lokal lebih baru dari aplikasi.");
  // The original local server created the initial schema without setting user_version.
  const hasInitialSchema = version === 0 && database.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'items'").get();
  for (const { tag } of entries.slice(hasInitialSchema ? 1 : version)) {
    database.exec(readFileSync(new URL(tag + ".sql", migrations), "utf8"));
  }
  database.exec("PRAGMA user_version = " + entries.length);
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
const DB = {
  prepare(sql) {
    return { bind(...values) {
      const prepared = database.prepare(sql);
      return {
        first: async () => prepared.get(...values),
        all: () => ({ results: prepared.all(...values) }),
        run: async () => ({ meta: prepared.run(...values) })
      };
    } };
  },
  async batch(statements) {
    database.exec("BEGIN");
    try {
      const result = statements.map((statement) => statement.all());
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
};
const port = Number(process.env.RUANG_STOK_PORT || 4317);
const origin = "http://127.0.0.1:" + port;
createServer(async (req, res) => {
  try {
    if (!req.url.startsWith("/") || req.url.startsWith("//") || req.headers.host !== "127.0.0.1:" + port) {
      res.writeHead(403).end();
      return;
    }
    const parts = [];
    let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 524288) {
        res.writeHead(413).end();
        return;
      }
      parts.push(part);
    }
    const headers = new Headers(req.headers);
    headers.set("oai-authenticated-user-id", "local");
    const body = parts.length ? Buffer.concat(parts) : undefined;
    const response = await worker.fetch(new Request(origin + req.url, { method: req.method, headers, body }), { DB });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(port, "127.0.0.1", () => console.log("Ruang Stok IT lokal: " + origin));
