const assets = /* ASSETS */ {};
const itCategories = /* IT_CATEGORIES */ [];

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

async function saveItem(db, owner, input, itemId) {
  const sku = field(input.sku, 32, "SKU").toUpperCase();
  const name = field(input.name, 90, "Nama barang");
  const category = field(input.category, 40, "Kategori");
  const unit = field(input.unit, 20, "Satuan");
  const minimum = number(input.minimum, 0, "Stok minimum");
  const brand = input.brand === undefined ? null : field(input.brand, 60, "Merek", false);
  const model = input.model === undefined ? null : field(input.model, 60, "Model", false);
  const isItCategory = itCategories.includes(category);
  const categoryError = "Pilih salah satu kategori perangkat IT.";
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

async function readInput(request) {
  const body = await request.text();
  if (body.length > 8192) throw new InputError("Data yang dikirim terlalu panjang.");
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
