import { importLimit } from "./catalog.js";

const columns = [
  ["sku", "SKU", 90],
  ["name", "Nama barang", 170, "nama"],
  ["category", "Kategori IT", 110, "kategori"],
  ["unit", "Satuan", 60],
  ["minimum", "Stok minimum", 75, "minimum"],
  ["opening", "Stok awal", 72, "saldo"],
  ["brand", "Merek", 85],
  ["model", "Model", 120]
];

export const importTemplate = {
  filename: "ruang-stok-it-templat-impor",
  columns: columns.map(([, label]) => label),
  widths: columns.map(([, , width]) => width),
  rows: []
};

const empty = (value) => typeof value === "string" && !value.trim();

function csvRows(text) {
  const header = text.split(/\r\n|\n|\r/, 1)[0].replace(/"(?:[^"]|"")*"/g, "");
  const delimiter = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = [];
  let values = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let start = 1;
  function finishCell() {
    values.push(value);
    value = "";
    closedQuote = false;
  }
  function finishRow() {
    finishCell();
    if (values.some((cell) => !empty(cell))) rows.push({ line: start, values });
    if (rows.length > importLimit + 1) throw new Error("Batas impor " + importLimit + " baris barang per berkas.");
    values = [];
    start = line + 1;
  }
  for (let index = 0; index < text.length; index++) {
    let character = text[index];
    const newline = character === "\n" || character === "\r";
    if (character === "\r" && text[index + 1] === "\n") {
      index++;
      character = "\n";
    }
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else value += character;
    } else if (character === delimiter) {
      finishCell();
    } else if (newline) {
      finishRow();
    } else if (character === '"' && !value && !closedQuote) {
      quoted = true;
    } else if (character === '"' || closedQuote) {
      throw new Error("Tanda kutip CSV tidak valid pada baris " + line + ".");
    } else {
      value += character;
    }
    if (newline) line++;
  }
  if (quoted) throw new Error("Tanda kutip CSV belum ditutup pada baris " + start + ".");
  if (values.length || value || closedQuote) finishRow();
  return rows;
}

async function xlsxRows(buffer) {
  const worker = new Worker("/import-xlsx-worker.js");
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Berkas Excel terlalu rumit untuk dibaca. Gunakan templat atau simpan sebagai CSV UTF-8.")), 12000);
      worker.addEventListener("error", () => reject(new Error("Pembaca Excel gagal dimuat. Coba lagi atau gunakan CSV UTF-8.")), { once: true });
      worker.addEventListener("message", ({ data }) => {
        if (data.error) reject(new Error(data.error));
        else resolve(data.rows);
      }, { once: true });
      worker.postMessage({ buffer, limit: importLimit }, [buffer]);
    });
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}

export async function parseImportFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran berkas maksimum 2 MB.");
  const extension = file.name.split(".").at(-1).toLowerCase();
  const buffer = await file.arrayBuffer();
  let grid;
  if (extension === "xlsx") {
    grid = await xlsxRows(buffer);
  } else if (extension === "csv") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new Error("Simpan CSV dengan pengodean UTF-8.");
    }
    grid = csvRows(text);
  } else {
    throw new Error("Pilih berkas .xlsx atau .csv.");
  }
  if (!grid.length || grid[0].line !== 1) throw new Error("Letakkan judul kolom pada baris pertama.");
  const normalize = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
  const headers = grid[0].values.map(normalize);
  const indices = columns.map(([key, label, , ...aliases]) => {
    const names = [normalize(label), ...aliases];
    const matching = headers.flatMap((value, i) => names.includes(value) ? [i] : []);
    if (matching.length > 1) throw new Error("Kolom " + label + " muncul lebih dari sekali.");
    if (!matching.length && ["sku", "name", "category", "unit"].includes(key)) throw new Error("Kolom " + label + " wajib ada. Gunakan judul dari templat.");
    return matching[0] ?? -1;
  });
  const rows = grid.slice(1).map(({ line, values }) => ({
    line,
    ...Object.fromEntries(columns.map(([key], i) => [key, values[indices[i]] ?? ""]))
  })).filter((row) => columns.some(([key]) => !empty(row[key])));
  if (!rows.length) throw new Error("Belum ada baris barang setelah judul kolom.");
  return rows;
}
