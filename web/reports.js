const encode = (value) => new TextEncoder().encode(value);
const safeText = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
const xml = (value) => safeText(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[c]);

function csvCell(value) {
  if (typeof value === "number") return String(value);
  const content = safeText(value);
  // Guard spreadsheet formula prefixes while preserving numeric fields as numbers.
  const text = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(content) ? "'" + content : content;
  return '"' + text.replaceAll('"', '""') + '"';
}

function csv(report) {
  return "\uFEFF" + [report.columns, ...report.rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Open Packaging uses ZIP. These small text parts use the uncompressed ZIP method.
function zip(files) {
  const local = [];
  const directory = [];
  let offset = 0;
  for (const [filename, content] of Object.entries(files)) {
    const name = encode(filename);
    const data = encode(content);
    const checksum = crc32(data);
    const header = new Uint8Array(30);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    const central = new Uint8Array(46);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    central.set(header.subarray(4, 30), 6);
    c.setUint32(42, offset, true);
    local.push(header, name, data);
    directory.push(central, name);
    offset += header.length + name.length + data.length;
  }
  const footer = new Uint8Array(22);
  const f = new DataView(footer.buffer);
  const count = Object.keys(files).length;
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, count, true);
  f.setUint16(10, count, true);
  f.setUint32(12, directory.reduce((total, part) => total + part.length, 0), true);
  f.setUint32(16, offset, true);
  return [...local, ...directory, footer];
}

function spreadsheet(report) {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const pkg = "http://schemas.openxmlformats.org/package/2006";
  const rows = [report.columns, ...report.rows];
  const address = (column, row) => String.fromCharCode(65 + column) + (row + 1);
  const sheet = rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((value, j) => {
    const attributes = ' r="' + address(j, i) + '"' + (i === 0 ? ' s="1"' : "");
    return typeof value === "number"
      ? '<c' + attributes + '><v>' + value + '</v></c>'
      : '<c' + attributes + ' t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
  }).join("") + "</row>").join("");
  const widths = report.widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.max(12, Math.round(w / 5)) + '" customWidth="1"/>').join("");
  return zip({
    "[Content_Types].xml": '<Types xmlns="' + pkg + '/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="' + pkg + '/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="' + ns + '" xmlns:r="' + rel + '"><bookViews><workbookView/></bookViews><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="' + pkg + '/relationships"><Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<worksheet xmlns="' + ns + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths + '</cols><sheetData>' + sheet + '</sheetData><autoFilter ref="A1:' + address(report.columns.length - 1, rows.length - 1) + '"/></worksheet>',
    "xl/styles.xml": '<styleSheet xmlns="' + ns + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF20372B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  });
}

function wrap(ctx, value, width) {
  const lines = [""];
  for (const word of safeText(value).split(/\s+/)) {
    const line = lines.at(-1);
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width <= width) {
      lines[lines.length - 1] = next;
      continue;
    }
    if (line) lines.push("");
    for (const character of word) {
      const current = lines.at(-1);
      if (ctx.measureText(current + character).width > width) lines.push(character);
      else lines[lines.length - 1] = current + character;
    }
  }
  return lines;
}

// Canvas renders the same glyphs as the browser, including localized item names.
// Each report page is a high-resolution image inside a standard, paginated PDF.
async function pdf(report) {
  const canvas = document.createElement("canvas");
  canvas.width = 1684;
  canvas.height = 1190;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  const images = [];
  const left = 30;
  const right = 812;
  let y;
  function rule(at) {
    ctx.fillStyle = "#dbe2dc";
    ctx.fillRect(left, at, right - left, .6);
  }
  function drawRow(cells, top, bold) {
    ctx.fillStyle = bold ? "#215b45" : "#18231e";
    let x = left;
    for (const [i, lines] of cells.entries()) {
      lines.forEach((line, j) => ctx.fillText(line, x + 6, top + 14 + j * 13));
      x += report.widths[i];
    }
  }
  function startPage() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 842, 595);
    ctx.fillStyle = "#215b45";
    ctx.font = "600 11px sans-serif";
    ctx.fillText("RUANG STOK IT  /  GUDANG IT", left, 31);
    ctx.font = "bold 23px sans-serif";
    ctx.fillText(report.title, left, 59);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#526359";
    const subtitles = wrap(ctx, report.caption, right - left);
    subtitles.forEach((line, i) => ctx.fillText(line, left, 78 + i * 13));
    y = 87 + subtitles.length * 13;
    rule(y);
    ctx.font = "bold 10px sans-serif";
    drawRow(report.columns.map((value, i) => wrap(ctx, value, report.widths[i] - 12)), y, true);
    y += 31;
    rule(y);
    ctx.font = "10px sans-serif";
  }
  async function finishPage() {
    rule(556);
    ctx.fillStyle = "#526359";
    ctx.font = "10px sans-serif";
    ctx.fillText("Ruang Stok IT  •  Halaman " + (images.length + 1), left, 575);
    const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
    images.push(new Uint8Array(await image.arrayBuffer()));
  }
  startPage();
  if (!report.rows.length) {
    ctx.fillStyle = "#526359";
    ctx.fillText("Tidak ada data yang cocok dengan filter.", left + 6, y + 18);
  }
  for (const row of report.rows) {
    const cells = row.map((value, i) => wrap(ctx, value, report.widths[i] - 12));
    const height = Math.max(25, Math.max(...cells.map((cell) => cell.length)) * 13 + 9);
    if (y + height > 549) {
      await finishPage();
      startPage();
    }
    drawRow(cells, y, false);
    y += height;
    rule(y);
  }
  await finishPage();
  const parts = [];
  const offsets = [0];
  let size = 0;
  function add(part) {
    const data = typeof part === "string" ? encode(part) : part;
    parts.push(data);
    size += data.length;
  }
  function object(...contents) {
    const id = offsets.length;
    offsets.push(size);
    add(id + " 0 obj\n");
    contents.forEach(add);
    add("\nendobj\n");
  }
  add("%PDF-1.4\n");
  object("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = images.map((_, i) => (3 + 3 * i) + " 0 R");
  object("<< /Type /Pages /Count " + images.length + " /Kids [" + kids.join(" ") + "] >>");
  images.forEach((image, i) => {
    const page = 3 + 3 * i;
    const commands = "q 842 0 0 595 0 0 cm /Image Do Q\n";
    object("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Image " + (page + 2) + " 0 R >> >> /Contents " + (page + 1) + " 0 R >>");
    object("<< /Length " + commands.length + " >>\nstream\n" + commands + "endstream");
    object("<< /Type /XObject /Subtype /Image /Width 1684 /Height 1190 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + image.length + " >>\nstream\n", image, "\nendstream");
  });
  const xref = size;
  add("xref\n0 " + offsets.length + "\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) add(String(offset).padStart(10, "0") + " 00000 n \n");
  add("trailer\n<< /Size " + offsets.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  return parts;
}

export async function downloadReport(report, type) {
  const formats = {
    csv: ["text/csv;charset=utf-8", (data) => [csv(data)]],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", spreadsheet],
    pdf: ["application/pdf", pdf]
  };
  const [mime, build] = formats[type];
  const blob = new Blob(await build(report), { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = report.filename + "." + type;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
