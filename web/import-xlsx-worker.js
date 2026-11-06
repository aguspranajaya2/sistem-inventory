/* global XLSX, importScripts */
importScripts("/vendor/xlsx.mini.min.js");

function verifyZip(buffer) {
  const bytes = new DataView(buffer);
  let footer = bytes.byteLength - 22;
  const earliest = Math.max(0, footer - 65535);
  for (; footer >= earliest; footer--) {
    if (bytes.getUint32(footer, true) === 0x06054b50 &&
      footer + 22 + bytes.getUint16(footer + 20, true) === bytes.byteLength) break;
  }
  if (footer < earliest || bytes.getUint32(footer + 4, true) !== 0) throw new Error("Berkas bukan Excel .xlsx yang didukung.");
  const entries = bytes.getUint16(footer + 10, true);
  const size = bytes.getUint32(footer + 12, true);
  let index = bytes.getUint32(footer + 16, true);
  const end = index + size;
  if (entries > 512 || end > footer) throw new Error("Struktur berkas Excel melebihi batas.");
  let expanded = 0;
  let workbook = false;
  const decoder = new TextDecoder();
  for (let entry = 0; entry < entries; entry++) {
    if (index + 46 > end || bytes.getUint32(index, true) !== 0x02014b50) throw new Error("Struktur berkas Excel tidak valid.");
    if (bytes.getUint16(index + 8, true) & 1) throw new Error("Buka proteksi kata sandi berkas Excel sebelum mengimpor.");
    expanded += bytes.getUint32(index + 24, true);
    const length = bytes.getUint16(index + 28, true);
    const name = decoder.decode(new Uint8Array(buffer, index + 46, length));
    if (name === "xl/workbook.xml") workbook = true;
    index += 46 + length + bytes.getUint16(index + 30, true) + bytes.getUint16(index + 32, true);
    if (expanded > 16 * 1024 * 1024) throw new Error("Isi berkas Excel melebihi batas. Gunakan templat atau CSV UTF-8.");
  }
  if (!workbook || index !== end) throw new Error("Berkas bukan Excel .xlsx yang didukung.");
}

self.addEventListener("message", ({ data: { buffer, limit } }) => {
  try {
    verifyZip(buffer);
    const workbook = XLSX.read(buffer, { type: "array", sheets: 0, sheetRows: limit + 2, cellDates: true, cellHTML: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const ref = sheet?.["!fullref"] || sheet?.["!ref"];
    if (!ref) throw new Error("Sheet pertama tidak berisi data.");
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r > limit || range.e.c >= 32) throw new Error("Sheet pertama dapat berisi hingga " + limit + " baris barang dan 32 kolom.");
    const rows = [];
    for (let row = 0; row <= range.e.r; row++) {
      const values = [];
      for (let column = 0; column <= range.e.c; column++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        values.push(cell?.f || cell?.F || cell?.t === "d" || cell?.t === "e" ? { unsupported: true } : cell?.v ?? "");
      }
      if (values.some((value) => typeof value !== "string" || value.trim())) rows.push({ line: row + 1, values });
    }
    self.postMessage({ rows });
  } catch (error) {
    self.postMessage({ error: error instanceof RangeError ? "Struktur berkas Excel tidak valid." : error.message });
  }
});
