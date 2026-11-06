import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import worker from "../dist/server/index.js";

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const database = new DatabaseSync(process.env.RUANG_STOK_EPHEMERAL === "1" ? ":memory:" : new URL("../data/inventory.sqlite", import.meta.url));
database.exec("PRAGMA foreign_keys = ON");
if (!database.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'items'").get()) {
  database.exec("BEGIN");
  try {
    database.exec(readFileSync(new URL("../drizzle/0000_inventory.sql", import.meta.url), "utf8"));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
const DB = {
  prepare(sql) {
    return { bind(...values) {
      const prepared = database.prepare(sql);
      return {
        first: async () => prepared.get(...values),
        all: async () => ({ results: prepared.all(...values) }),
        run: async () => ({ meta: prepared.run(...values) })
      };
    } };
  },
  async batch(statements) {
    database.exec("BEGIN");
    try {
      const result = await Promise.all(statements.map((statement) => statement.all()));
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
      if (size > 32768) {
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
}).listen(port, "127.0.0.1", () => console.log("Ruang Stok lokal: " + origin));
