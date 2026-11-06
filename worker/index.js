const assets = /* ASSETS */ {};
const itCategories = /* IT_CATEGORIES */ [];
const importLimit = /* IMPORT_LIMIT */ 0;
const categoryError = "Pilih salah satu kategori perangkat IT.";

const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin"
};
const json = (value, status = 200) => Response.json(value, { status, headers });

class InputError extends Error {}

function field(value, limit, label, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > limit || /[\u0000-\u001f]/.test(result)) {
    throw new InputError(label + " tidak valid.");
  }
  return result;
}

function number(value, min, label) {
  if (!Number.isInteger(value) || value < min || value > 1000000000) {
    throw new InputError(label + " harus berupa bilangan bulat dalam rentang yang diizinkan.");
  }
  return value;
}

const statement = (db, query, ...parameters) => db.prepare(query).bind(...parameters);

async function snapshot(db, owner) {
  const [items, movements] = await db.batch([
    statement(db, "SELECT id, sku, name, category, unit, minimum, stock, brand, model FROM items WHERE owner = ? ORDER BY name COLLATE NOCASE, sku", owner),
    statement(db, "SELECT m.id, m.item_id AS itemId, m.kind, m.delta, m.balance, m.note, m.at FROM movements m WHERE m.owner = ? ORDER BY m.at DESC, m.rowid DESC", owner)
  ]);
  return { items: items.results, movements: movements.results };
}

function itemFields(input) {
  return {
    sku: field(input.sku, 32, "SKU").toUpperCase(),
    name: field(input.name, 90, "Nama barang"),
    category: field(input.category, 40, "Kategori"),
    unit: field(input.unit, 20, "Satuan"),
    minimum: number(input.minimum, 0, "Stok minimum"),
    brand: input.brand === undefined ? null : field(input.brand, 60, "Merek", false),
    model: input.model === undefined ? null : field(input.model, 60, "Model", false)
  };
}

async function saveItem(db, owner, input, itemId) {
  const { sku, name, category, unit, minimum, brand, model } = itemFields(input);
  const isItCategory = itCategories.includes(category);
  if (!itemId && !isItCategory) throw new InputError(categoryError);

  if (!itemId) {
    await statement(db, "INSERT INTO items (sku, name, category, unit, minimum, brand, model, owner, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      sku, name, category, unit, minimum, brand ?? "", model ?? "", owner, crypto.randomUUID()).run();
    return json({ ok: true }, 201);
  }

  // A legacy category can be retained on its existing item or replaced with an IT category.
  const result = await statement(db, `UPDATE items
    SET sku = ?, name = ?, category = ?, unit = ?, minimum = ?,
        brand = COALESCE(?, brand), model = COALESCE(?, model)
    WHERE owner = ? AND id = ? AND (? = 1 OR category = ?)
      AND (unit = ? OR NOT EXISTS (SELECT 1 FROM movements WHERE owner = ? AND item_id = ?))`,
  sku, name, category, unit, minimum, brand, model, owner, itemId, Number(isItCategory), category, unit, owner, itemId).run();
  if (!result.meta.changes) {
    const existing = await statement(db, "SELECT category FROM items WHERE owner = ? AND id = ?", owner, itemId).first();
    if (!existing) return json({ error: "Barang tidak ditemukan." }, 404);
    if (!isItCategory && category !== existing.category) throw new InputError(categoryError);
    return json({ error: "Satuan terkunci setelah barang memiliki riwayat mutasi." }, 409);
  }
  return json({ ok: true });
}

async function saveMovement(db, owner, input) {
  const id = field(input.id, 36, "ID mutasi");
  const itemId = field(input.itemId, 36, "Barang");
  const kind = field(input.kind, 8, "Jenis mutasi");
  if (!["in", "out", "count"].includes(kind)) throw new InputError("Jenis mutasi tidak valid.");
  const quantity = number(input.quantity, kind === "count" ? 0 : 1, "Jumlah");
  const note = field(input.note, 180, "Catatan", kind === "count");
  const expectedStock = kind === "count" ? number(input.expectedStock, 0, "Saldo acuan") : null;
  const movementId = owner + "/" + id;
  // INSERT and the trigger commit together. The SELECT reads the stock at the time of the write.
  const sql = `INSERT INTO movements (id, owner, item_id, kind, delta, balance, note, at)
    SELECT ?, owner, id, ?, CASE ? WHEN 'count' THEN ? - stock WHEN 'out' THEN -? ELSE ? END,
    CASE ? WHEN 'count' THEN ? WHEN 'out' THEN stock - ? ELSE stock + ? END, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM items WHERE owner = ? AND id = ? AND (? IS NULL OR stock = ?)
    AND NOT EXISTS (SELECT 1 FROM movements WHERE id = ?)`;
  const result = await statement(db, sql, movementId, kind, kind, quantity, quantity, quantity,
    kind, quantity, quantity, quantity, note, owner, itemId, expectedStock, expectedStock, movementId).run();
  if (result.meta.changes) return json({ ok: true }, 201);
  const prior = await statement(db, "SELECT item_id, kind, delta, balance, note FROM movements WHERE owner = ? AND id = ?", owner, movementId).first();
  const sameQuantity = prior && (prior.kind === "count" ? prior.balance : Math.abs(prior.delta)) === quantity;
  if (prior && prior.item_id === itemId && prior.kind === kind && sameQuantity && prior.note === note) return json({ ok: true });
  if (prior) return json({ error: "ID mutasi sudah digunakan dengan rincian lain." }, 409);
  if (kind === "count" && await statement(db, "SELECT 1 FROM items WHERE owner = ? AND id = ?", owner, itemId).first()) {
    return json({ error: "Saldo berubah sejak formulir dibuka. Periksa saldo terbaru dan konfirmasi hitung fisik sebelum menyimpan lagi." }, 409);
  }
  return json({ error: "Barang tidak ditemukan." }, 404);
}

function textCell(value, label) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new InputError(label + " harus berupa teks atau angka biasa.");
  }
  return String(value);
}

function quantityCell(value, label) {
  const text = textCell(value, label).trim();
  if (text && !/^\d+$/.test(text)) throw new InputError(label + " harus berupa bilangan bulat tanpa pemisah ribuan.");
  return number(Number(text), 0, label);
}

function importRows(input) {
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > importLimit) {
    throw new InputError("Impor harus berisi 1–" + importLimit + " baris barang.");
  }
  const rows = input.rows.map((row) => {
    if (!row || !Number.isInteger(row.line) || row.line < 2 || row.line > 1000000) {
      throw new InputError("Nomor baris pada berkas tidak valid.");
    }
    const fields = { line: row.line };
    try {
      fields.sku = textCell(row.sku, "SKU").trim().toUpperCase().slice(0, 64);
      fields.name = textCell(row.name, "Nama barang").trim().slice(0, 90);
      fields.category = textCell(row.category, "Kategori").trim().slice(0, 40);
      const category = itCategories.find((option) => option.toLowerCase() === fields.category.toLowerCase());
      const item = itemFields({
        sku: textCell(row.sku, "SKU"), name: textCell(row.name, "Nama barang"),
        category: category ?? textCell(row.category, "Kategori"), unit: textCell(row.unit, "Satuan"),
        minimum: quantityCell(row.minimum ?? "", "Stok minimum"),
        brand: textCell(row.brand ?? "", "Merek"), model: textCell(row.model ?? "", "Model")
      });
      if (!category) throw new InputError(categoryError);
      return { line: row.line, ...item, opening: quantityCell(row.opening ?? "", "Stok awal") };
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      return { ...fields, error: error.message };
    }
  });
  const counts = new Map();
  for (const row of rows) {
    if (row.sku) counts.set(row.sku, (counts.get(row.sku) ?? 0) + 1);
  }
  for (const row of rows) {
    if (!row.error && counts.get(row.sku) > 1) row.error = "SKU muncul lebih dari sekali dalam berkas.";
  }
  return rows;
}

async function existingImportSkus(db, owner, rows) {
  const skus = rows.filter((row) => !row.error).map((row) => row.sku);
  if (!skus.length) return;
  const result = await statement(db, "SELECT sku FROM items WHERE owner = ? AND sku IN (SELECT value FROM json_each(?))",
    owner, JSON.stringify(skus)).all();
  const conflicts = new Set(result.results.map(({ sku }) => sku));
  for (const row of rows) {
    if (!row.error && conflicts.has(row.sku)) row.error = "SKU sudah terdaftar di inventaris.";
  }
}

const importPreview = (rows) => ({ rows, ready: rows.every((row) => !row.error) });

async function importItems(db, owner, input, commit) {
  const rows = importRows(input);
  if (!commit) {
    await existingImportSkus(db, owner, rows);
    return json(importPreview(rows));
  }
  if (!importPreview(rows).ready) return json({ ...importPreview(rows), error: "Perbaiki baris yang bermasalah sebelum mengimpor." }, 400);

  const id = field(input.id, 36, "ID impor");
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new InputError("ID impor tidak valid.");
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  const readReceipt = () => statement(db, "SELECT digest FROM import_batches WHERE owner = ? AND id = ?", owner, id).first();
  const success = { imported: rows.length, openings: rows.filter((row) => row.opening > 0).length };
  const replay = (receipt) => receipt.digest === digest ? json(success) : json({ error: "ID impor sudah dipakai untuk berkas lain." }, 409);
  const prior = await readReceipt();
  if (prior) return replay(prior);

  await existingImportSkus(db, owner, rows);
  const conflicts = () => json({ ...importPreview(rows), error: "Ada SKU yang sudah terdaftar. Perbarui berkas sebelum mengimpor." }, 409);
  if (!importPreview(rows).ready) {
    // The first receipt read and the SKU check may straddle another commit of this same batch.
    const receipt = await readReceipt();
    return receipt ? replay(receipt) : conflicts();
  }

  const records = JSON.stringify(rows.map((row) => ({ ...row, id: crypto.randomUUID() })));
  try {
    await db.batch([
      statement(db, "INSERT INTO import_batches (owner, id, digest) VALUES (?, ?, ?)", owner, id, digest),
      statement(db, `INSERT INTO items (id, owner, sku, name, category, unit, minimum, brand, model)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.sku'), json_extract(value, '$.name'),
          json_extract(value, '$.category'), json_extract(value, '$.unit'), json_extract(value, '$.minimum'),
          json_extract(value, '$.brand'), json_extract(value, '$.model') FROM json_each(?)`, owner, records),
      statement(db, `INSERT INTO movements (id, owner, item_id, kind, delta, balance, note, at)
        SELECT ? || '/import/' || json_extract(value, '$.id'), ?, json_extract(value, '$.id'), 'in',
          json_extract(value, '$.opening'), json_extract(value, '$.opening'), 'Saldo awal dari impor',
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM json_each(?) WHERE json_extract(value, '$.opening') > 0`, owner, owner, records)
    ]);
  } catch (error) {
    const receipt = await readReceipt();
    if (receipt) return replay(receipt);
    await existingImportSkus(db, owner, rows);
    if (!importPreview(rows).ready) return conflicts();
    throw error;
  }
  return json(success, 201);
}

async function readInput(request, limit = 8192) {
  const body = await request.text();
  if (body.length > limit) throw new InputError("Data yang dikirim terlalu panjang.");
  try {
    const input = JSON.parse(body);
    if (input && typeof input === "object" && !Array.isArray(input)) return input;
  } catch {}
  throw new InputError("Data yang dikirim tidak valid.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      const asset = Object.hasOwn(assets, path) && assets[path];
      if (!asset || !["GET", "HEAD"].includes(request.method)) return new Response("Tidak ditemukan.", { status: 404, headers });
      return new Response(request.method === "HEAD" ? null : asset.body, {
        headers: {
          ...headers, "content-type": asset.type,
          "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; object-src 'none'"
        }
      });
    }
    const owner = request.headers.get("oai-authenticated-user-id");
    if (!owner) return json({ error: "Masuk untuk mengakses inventaris." }, 401);
    if (!env.DB) return json({ error: "Penyimpanan belum tersambung." }, 503);
    if (request.method !== "GET" && (request.headers.get("origin") !== url.origin
      || !request.headers.get("content-type")?.startsWith("application/json"))) {
      return json({ error: "Permintaan tidak diizinkan." }, 403);
    }
    try {
      if (path === "/api/snapshot" && request.method === "GET") return json(await snapshot(env.DB, owner));
      if (path === "/api/items" && request.method === "POST") return await saveItem(env.DB, owner, await readInput(request));
      if (request.method === "POST" && (path === "/api/import/preview" || path === "/api/import")) {
        return await importItems(env.DB, owner, await readInput(request, 200000), path === "/api/import");
      }
      const item = path.match(/^\/api\/items\/([a-f0-9-]{36})$/i);
      if (item && request.method === "PATCH") return await saveItem(env.DB, owner, await readInput(request), item[1]);
      if (path === "/api/movements" && request.method === "POST") return await saveMovement(env.DB, owner, await readInput(request));
      return json({ error: "Alamat tidak ditemukan." }, 404);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, 400);
      if (/UNIQUE constraint failed: items\.owner, items\.sku/i.test(error.message)) {
        return json({ error: "SKU tersebut sudah terdaftar." }, 409);
      }
      if (/CHECK constraint failed/i.test(error.message)) {
        return json({ error: "Mutasi akan membuat saldo negatif atau melebihi batas. Periksa jumlah dan saldo terbaru." }, 409);
      }
      console.error("Inventory operation failed:", error.message);
      return json({ error: "Data gagal diproses. Coba lagi." }, 500);
    }
  }
};
