import { demoData } from "./demo.js";
import { itCategories } from "./catalog.js";
import { openImport } from "./import-ui.js";
import { downloadReport } from "./reports.js";

const el = (selector) => document.querySelector(selector);
const view = el("#view");
const dialog = el("#form-dialog");
const labels = { ringkasan: "Ringkasan", barang: "Barang", mutasi: "Mutasi", laporan: "Laporan" };
const kinds = { in: "Masuk", out: "Keluar", count: "Opname" };
const icons = {
  ringkasan: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  barang: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10m-4.5-16 9 4"/>',
  mutasi: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  laporan: '<path d="M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8m-8 4h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 6v5h-5m5 0a8 8 0 1 0-1 6"/>',
  warehouse: '<path d="m3 9 9-5 9 5v11H3V9Zm4 11v-7h10v7m-10-3h10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  edit: '<path d="m14 6 4 4M5 19l4-1L20 7l-4-4L5 14l-1 5h1Z"/>'
};
const icon = (name) => '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round">' + icons[name] + '</svg>';
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const option = (v, label, current) => '<option value="' + escape(v) + '"' + (v === current ? " selected" : "") + '>' + escape(label) + '</option>';
const num = new Intl.NumberFormat("id-ID");
const dateFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", weekday: "short" });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (date = new Date()) => dayKeyFormat.format(new Date(date));
const stamp = (date) => dateFormat.format(new Date(date)) + " WITA";
const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const example = demoData();
const state = {
  live: { items: [], movements: [] }, demo: new URL(location.href).searchParams.get("contoh") === "1",
  error: "", ready: false, fresh: "", search: "", category: "", itemStatus: "",
  movementKind: "", movementSearch: "", reportType: "stock", reportCategory: "",
  from: dayKey(daysAgo(29)), until: dayKey(), period: 7
};
const source = () => state.demo ? example : state.live;
const mapItems = (items) => new Map(items.map((item) => [item.id, item]));
const route = () => Object.hasOwn(labels, location.hash.slice(1)) ? location.hash.slice(1) : "ringkasan";
const status = (item) => item.stock === 0 ? "zero" : item.stock <= item.minimum ? "low" : "ok";
const statusLabels = { zero: "Habis", low: "Stok menipis", ok: "Aman" };
const categories = (items) => [...new Set(items.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "id"));
const message = (text) => '<p class="empty">' + escape(text) + '</p>';
const button = (action, title, glyph, style = "", other = "") => '<button type="button" class="btn ' + style + '" data-act="' + action + '" ' + other + '>' + (glyph ? icon(glyph) : "") + title + '</button>';
const toolbarSelect = (id, label, options) => '<label>' + label + '<select id="' + id + '" aria-label="' + label + '">' + options + '</select></label>';
const search = (id, label, value) => '<label>' + label + '<input type="search" id="' + id + '" placeholder="Nama, SKU, merek, atau model…" value="' + escape(value) + '"></label>';
const itemIdentity = (item) => [item.sku, item.brand, item.model].filter(Boolean).join(" · ");
const match = (item, query) => [item.name, item.sku, item.brand, item.model].join(" ")
  .toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"));
const head = (title, subtitle, actions = "") => '<header class="page-head"><div><h1>' + title + '</h1><p>' + subtitle + '</p></div>' + (actions ? '<div class="actions">' + actions + '</div>' : "") + '</header>';
const panelHead = (title, subtitle = "", action = "") => '<div class="panel-head"><div><h2>' + title + '</h2>' + (subtitle ? '<p>' + subtitle + '</p>' : "") + '</div>' + action + '</div>';
const pill = (type, text) => '<span class="pill ' + type + '">' + escape(text) + '</span>';
const action = (name, id, label, glyph) => '<button type="button" class="icon-btn" data-act="' + name + '" data-id="' + escape(id) + '" aria-label="' + escape(label) + '" title="' + escape(label) + '">' + icon(glyph) + '</button>';
const deltaText = (delta) => (delta > 0 ? "+" : "") + num.format(delta);
const table = (columns, rows, name, className = "data-table", numeric = []) =>
  '<div class="scroller" role="region" aria-label="' + name + '" tabindex="0"><table class="' + className + '" aria-label="' + name + '"><thead><tr>' +
  columns.map((c, i) => '<th scope="col"' + (numeric.includes(i) ? ' class="num"' : "") + '>' + c + '</th>').join("") +
  '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((value, i) =>
    '<td' + (numeric.includes(i) ? ' class="num"' : "") + '>' + value + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';

function movementTable(movements, items) {
  if (!movements.length) return message("Belum ada mutasi untuk ditampilkan.");
  return table(["Barang", "Jenis", "Perubahan", "Saldo", "Waktu (WITA)", "Catatan"], movements.map((m) => {
    const item = items.get(m.itemId);
    return ['<strong>' + escape(item.name) + '</strong><small>' + escape(itemIdentity(item)) + '</small>', pill(m.kind === "in" ? "in" : "", kinds[m.kind]),
      deltaText(m.delta) + " " + escape(item.unit), num.format(m.balance), escape(stamp(m.at).replace(" WITA", "")), escape(m.note || "—")];
  }), "Daftar mutasi", "data-table", [2, 3]);
}

function chart(movements) {
  const days = Array.from({ length: state.period }, (_, i) => {
    const date = daysAgo(state.period - 1 - i);
    return { key: dayKey(date), label: state.period === 7 ? dayFormat.format(date) : dayKey(date).slice(-2), in: 0, out: 0, count: 0 };
  });
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const movement of movements) {
    const day = byDay.get(dayKey(movement.at));
    if (day) day[movement.kind]++;
  }
  const top = Math.max(3, Math.ceil(Math.max(...days.flatMap((d) => [d.in, d.out, d.count])) / 3) * 3);
  const colors = ["#287557", "#8f9d94", "#cdd7cf"];
  const bars = days.map((day) => {
    const label = day.key + " · Masuk " + day.in + ", keluar " + day.out + ", opname " + day.count;
    return '<svg class="day-bars" width="100%" height="100%" viewBox="0 0 44 136" preserveAspectRatio="none" role="img" aria-label="' + label + '"><title>' + label + '</title>' +
      Object.keys(kinds).map((k, i) => {
        const height = Math.round(day[k] * 136 / top);
        return '<rect x="' + (6 + i * 11) + '" y="' + (136 - height) + '" width="9" height="' + height + '" fill="' + colors[i] + '" rx="1"/>';
      }).join("") + '</svg>';
  }).join("");
  return '<div class="chart-body"><div class="legend">' + Object.entries(kinds).map(([k, label]) => '<span><b class="' + k + '"></b>' + label + '</span>').join("") + '</div>' +
    '<div class="chart"><div class="axis"><span>' + top + '</span><span>' + (top * 2 / 3) + '</span><span>' + (top / 3) + '</span><span>0</span></div><div class="plot">' + bars +
    '</div><div class="days">' + days.map((d, i) => '<span>' + (state.period === 7 || i % 3 === 0 || i === days.length - 1 ? escape(d.label) : "") + '</span>').join("") + '</div></div></div>';
}

function overview() {
  const { items, movements } = source();
  const low = items.filter((item) => status(item) === "low");
  const zero = items.filter((item) => status(item) === "zero");
  const attention = [...zero, ...low.sort((a, b) => a.stock / a.minimum - b.stock / b.minimum)];
  const recent = movements.filter((m) => dayKey(m.at) >= dayKey(daysAgo(6)));
  const subtitle = items.length ? (attention.length ? attention.length + " barang perlu perhatian di gudang IT." : "Seluruh barang berada di atas batas minimum.") : "Tambahkan perangkat atau perlengkapan IT, lalu catat stok awal sebagai mutasi masuk.";
  const metrics = [
    ["Barang terdaftar", items.length, "SKU di gudang IT"],
    ["Stok menipis", low.length, "Saldo ≤ stok minimum"],
    ["Stok habis", zero.length, "Saldo sama dengan nol"],
    ["Mutasi 7 hari", recent.length, "Jumlah transaksi"]
  ].map(([name, value, desc], i) => '<div class="metric"><span>' + name + '</span><strong' + ([1, 2].includes(i) && value ? ' class="warn"' : '') + '>' + num.format(value) + '</strong><small>' + desc + '</small></div>').join("");
  const watch = attention.length ? '<div class="watch-list">' + attention.slice(0, 4).map((item) =>
    '<div class="watch-row"><div><strong>' + escape(item.name) + '</strong><small>' + escape(itemIdentity(item)) + ' · ' + escape(item.unit) + '</small></div><div class="ratio"><b>' +
    num.format(item.stock) + '</b> / ' + num.format(item.minimum) + '<span class="ratio-track"><progress max="' + Math.max(1, item.minimum) + '" value="' + item.stock + '" aria-label="Saldo dibanding minimum"></progress></span></div></div>').join("") + '</div>'
    : message(items.length ? "Belum ada barang di bawah batas stok." : "Daftar barang di bawah batas stok akan muncul di sini.");
  return head("Ringkasan stok IT", subtitle, state.demo ? "" : button("item", "Tambah barang", "plus") + button("movement", "Catat mutasi", "mutasi", "primary")) +
    '<section class="metrics panel" aria-label="Indikator stok">' + metrics + '</section><div class="overview-grid"><section class="panel chart-panel">' +
    panelHead("Arus mutasi", "Jumlah transaksi per hari · WITA", '<div class="toolbar">' + toolbarSelect("period", "Rentang", option("7", "7 hari", String(state.period)) + option("14", "14 hari", String(state.period))) + '</div>') +
    chart(movements) + '</section><section class="panel">' + panelHead("Pantau stok", "Saldo dibanding batas minimum", button("watch", "Lihat barang", "arrow", "link")) +
    watch + '</section></div><section class="panel">' + panelHead("Mutasi terbaru", "Catatan masuk, keluar, dan opname", '<a class="btn link" href="#mutasi">Lihat riwayat' + icon("arrow") + '</a>') +
    movementTable(movements.slice(0, 5), mapItems(items)) + '</section>';
}

function itemRows() {
  const items = source().items.filter((item) =>
    match(item, state.search) && (!state.category || item.category === state.category) &&
    (!state.itemStatus || (state.itemStatus === "attention" ? status(item) !== "ok" : status(item) === state.itemStatus)));
  const tally = el("#tally");
  if (tally) tally.textContent = num.format(items.length) + " barang";
  return items.length ? table(["Barang", "Kategori", "Stok", "Minimum", "Status", ...(state.demo ? [] : ["Tindakan"])], items.map((item) => [
    '<strong>' + escape(item.name) + '</strong><small>' + escape(itemIdentity(item)) + '</small>', escape(item.category) +
      (itCategories.includes(item.category) ? "" : '<small>Kategori lama</small>'),
    num.format(item.stock) + " " + escape(item.unit), num.format(item.minimum), pill(status(item), statusLabels[status(item)]),
    ...(state.demo ? [] : [action("edit", item.id, "Edit " + item.name, "edit") + action("movement", item.id, "Catat mutasi " + item.name, "mutasi")])
  ]), "Stok barang", "data-table", [2, 3]) : message("Tidak ada barang yang cocok dengan filter.");
}

function inventory() {
  const cats = categories(source().items);
  return head("Barang IT", "Cari perangkat berdasarkan SKU, merek, dan model. Pantau saldo per kategori.", state.demo ? "" : button("import", "Impor Excel / CSV") + button("item", "Tambah barang", "plus", "primary")) +
    '<section class="panel"><div class="toolbar">' + search("search", "Pencarian", state.search) +
    toolbarSelect("category", "Kategori", option("", "Semua kategori", state.category) + cats.map((v) => option(v, v, state.category)).join("")) +
    toolbarSelect("itemStatus", "Status", option("", "Semua status", state.itemStatus) + option("attention", "Perlu perhatian", state.itemStatus) +
      Object.entries(statusLabels).map(([v, label]) => option(v, label, state.itemStatus)).join("")) +
    '<span class="tally" id="tally" aria-live="polite"></span></div><div id="results"></div></section>';
}

function movementRows() {
  const { items, movements } = source();
  const byId = mapItems(items);
  const filtered = movements.filter((m) => (!state.movementKind || m.kind === state.movementKind) && match(byId.get(m.itemId), state.movementSearch));
  el("#tally").textContent = num.format(filtered.length) + " mutasi";
  return movementTable(filtered, byId);
}

function ledger() {
  return head("Riwayat mutasi", "Telusuri perubahan stok dan saldo setelah setiap transaksi.", state.demo ? "" : button("movement", "Catat mutasi", "mutasi", "primary")) +
    '<section class="panel"><div class="toolbar">' + search("movementSearch", "Pencarian", state.movementSearch) +
    toolbarSelect("movementKind", "Jenis mutasi", option("", "Semua jenis", state.movementKind) + Object.entries(kinds).map(([k, v]) => option(k, v, state.movementKind)).join("")) +
    '<span class="tally" id="tally" aria-live="polite"></span></div><div id="results"></div></section>';
}

function reportData() {
  const { items, movements } = source();
  const byId = mapItems(items);
  const include = (item) => !state.reportCategory || item.category === state.reportCategory;
  const caption = (scope, count) => scope + "  •  " + (state.reportCategory || "Semua kategori") + "  •  " + num.format(count) + " baris" + (state.demo ? "  •  Data contoh" : "");
  const filename = (name) => "ruang-stok-it-" + (state.demo ? "contoh-" : "") + name + "-" + dayKey();
  if (state.reportType === "ledger") {
    const filtered = movements.filter((m) => include(byId.get(m.itemId)) && dayKey(m.at) >= state.from && dayKey(m.at) <= state.until);
    return { title: "Laporan riwayat mutasi", filename: filename("mutasi"),
      caption: caption(state.from + " s.d. " + state.until + " (WITA)", filtered.length),
      columns: ["Waktu (WITA)", "SKU", "Nama barang", "Jenis", "Perubahan", "Saldo", "Satuan", "Catatan", "Merek", "Model"],
      widths: [99, 65, 118, 52, 63, 45, 52, 124, 70, 94],
      rows: filtered.map((m) => {
        const item = byId.get(m.itemId);
        return [stamp(m.at).replace(" WITA", ""), item.sku, item.name, kinds[m.kind], m.delta, m.balance, item.unit, m.note, item.brand, item.model];
      })
    };
  }
  const critical = state.reportType === "critical";
  const rows = items.filter((item) => include(item) && (!critical || status(item) !== "ok")).map((item) =>
    [item.sku, item.name, item.category, item.unit, item.stock, item.minimum, statusLabels[status(item)], item.brand, item.model]);
  return { title: critical ? "Laporan stok perlu perhatian" : "Laporan posisi stok", filename: filename(critical ? "stok-kritis" : "posisi-stok"),
    caption: caption("Snapshot " + stamp(state.demo || !state.fresh ? new Date() : state.fresh), rows.length),
    columns: ["SKU", "Nama barang", "Kategori", "Satuan", "Saldo", "Minimum", "Status", "Merek", "Model"],
    widths: [70, 155, 114, 57, 52, 58, 92, 80, 104], rows };
}

function reports() {
  return head("Laporan", "Saring data, tinjau hasilnya, lalu unduh dengan format yang dibutuhkan.") + '<section class="panel">' +
    '<div class="toolbar">' + toolbarSelect("reportType", "Jenis laporan", [
      ["stock", "Posisi stok"], ["critical", "Stok perlu perhatian"], ["ledger", "Riwayat mutasi"]
    ].map(([k, label]) => option(k, label, state.reportType)).join("")) +
    toolbarSelect("reportCategory", "Kategori", option("", "Semua kategori", state.reportCategory) +
      categories(source().items).map((v) => option(v, v, state.reportCategory)).join("")) +
    (state.reportType === "ledger" ? '<label>Dari tanggal<input type="date" id="from" value="' + escape(state.from) + '"></label><label>Sampai tanggal<input type="date" id="until" value="' + escape(state.until) + '"></label>' : "") +
    '</div><div id="report-result"></div></section>';
}

function reportResult() {
  if (state.reportType === "ledger" && (!state.from || !state.until || state.from > state.until)) return message("Pilih rentang tanggal yang valid.");
  const report = reportData();
  const buttons = ["xlsx", "csv", "pdf"].map((f) => button("export", f === "xlsx" ? "Excel (.xlsx)" : f.toUpperCase(), "download", f === "xlsx" ? "primary" : "", 'data-format="' + f + '"')).join("");
  return '<div class="exports"><p>' + escape(report.caption) + '</p>' + buttons + '</div>' +
    (report.rows.length ? table(report.columns, report.rows.map((row) => row.map((v) => typeof v === "number" ? num.format(v) : escape(v || "—"))),
      report.title, "report-table", [4, 5]) : message("Tidak ada data yang cocok dengan filter."));
}

function render() {
  const page = route();
  el("#navigation").innerHTML = '<p>Ruang kerja</p>' + Object.entries(labels).map(([key, label]) =>
    '<a href="#' + key + '"' + (key === page ? ' aria-current="page"' : "") + '>' + icon(key) + label + '</a>').join("");
  el("#connection").textContent = state.demo ? "Data contoh" : state.error ? "Gagal memuat" : state.fresh ? (location.hostname === "127.0.0.1" ? "Penyimpanan lokal" : "Penyimpanan online") : "Memuat inventaris…";
  const notice = el("#notice");
  if (state.demo) {
    notice.innerHTML = '<div class="notice"><span><strong>Data contoh IT</strong> · Coba filter dan unduh laporan.</span>' + button("demo", "Buka inventaris", "arrow", "link") + '</div>';
  } else if (state.error) {
    notice.innerHTML = '<div class="notice error" role="alert"><span>' + escape(state.error) + '</span>' + button("refresh", "Coba lagi", "refresh") + '</div>';
  } else if (state.ready && !state.live.items.length) {
    notice.innerHTML = '<div class="notice"><span>Inventaris IT Anda siap diisi. Lihat data contoh untuk mencoba alur laporan.</span>' + button("demo", "Lihat data contoh", "arrow", "link") + '</div>';
  } else notice.replaceChildren();
  if (!state.ready && !state.demo) {
    view.innerHTML = head(labels[page], "Memuat inventaris gudang IT…");
    return;
  }
  if (state.error && !state.fresh && !state.demo) {
    view.innerHTML = head(labels[page], "Data gudang IT belum dapat ditampilkan.", button("demo", "Lihat data contoh", "arrow"));
    return;
  }
  view.innerHTML = ({ ringkasan: overview, barang: inventory, mutasi: ledger, laporan: reports })[page]();
  if (page === "barang") el("#results").innerHTML = itemRows();
  if (page === "mutasi") el("#results").innerHTML = movementRows();
  if (page === "laporan") el("#report-result").innerHTML = reportResult();
}

async function request(path, method = "GET", data) {
  const response = await fetch(path, { method, headers: data ? { "content-type": "application/json" } : {}, body: data ? JSON.stringify(data) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Object.keys(payload).length) {
    const error = new Error(payload.error || "Koneksi terputus. Periksa jaringan lalu coba lagi.");
    if (Array.isArray(payload.rows)) error.rows = payload.rows;
    throw error;
  }
  return payload;
}

let refreshSequence = 0;
async function refresh() {
  const sequence = ++refreshSequence;
  try {
    const data = await request("/api/snapshot");
    if (sequence !== refreshSequence) return;
    state.live = data;
    state.error = "";
    state.fresh = new Date();
    if (!state.demo) {
      if (!categories(data.items).includes(state.category)) state.category = "";
      if (!categories(data.items).includes(state.reportCategory)) state.reportCategory = "";
    }
  } catch (error) {
    if (sequence !== refreshSequence) return;
    state.error = error.message;
  }
  state.ready = true;
  render();
}

let toastTimer;
function notify(message) {
  const toast = el("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function field(label, name, options = "", value = "", wide = false) {
  return '<label class="field' + (wide ? " wide" : "") + '">' + label + '<input name="' + name + '" ' + options + ' value="' + escape(value) + '"></label>';
}

function categoryField(current) {
  const legacy = current && !itCategories.includes(current) ? option(current, current + " (kategori lama)", current) : "";
  return '<label class="field">Kategori IT<select name="category" aria-label="Kategori IT" required>' +
    option("", "Pilih kategori IT", current ?? "") + legacy +
    itCategories.map((category) => option(category, category, current)).join("") + '</select></label>';
}

function openForm(type, id) {
  if (state.demo || !state.fresh) return;
  const items = source().items.map((item) => ({ ...item }));
  const item = items.find((record) => record.id === id);
  if (type === "movement" && !items.length) {
    notify("Tambahkan barang sebelum mencatat mutasi.");
    openForm("item");
    return;
  }
  const movement = type === "movement";
  const edit = type === "edit";
  const title = movement ? "Catat mutasi" : edit ? "Edit barang" : "Tambah barang";
  const fields = movement ?
    '<label class="field wide">Barang<select name="itemId" aria-label="Barang" required>' + items.map((item) => option(item.id, [item.sku, item.name, item.brand, item.model].filter(Boolean).join(" · "), id)).join("") + '</select></label>' +
    '<label class="field">Jenis<select name="kind" aria-label="Jenis">' + Object.entries(kinds).map(([k, v]) => option(k, v, "")).join("") + '</select></label>' +
    field('<span id="quantity-label">Jumlah masuk</span>', "quantity", 'type="number" min="1" max="1000000000" step="1" required') +
    field("Catatan", "note", 'maxlength="180" placeholder="Misalnya penerimaan pemasok"', "", true) :
    field("SKU", "sku", 'maxlength="32" required', item?.sku) +
    field("Nama barang", "name", 'maxlength="90" required', item?.name) +
    categoryField(item?.category) +
    field("Satuan", "unit", 'maxlength="20" required placeholder="unit, pcs, atau rol"', item?.unit) +
    field("Merek (opsional)", "brand", 'maxlength="60" placeholder="Contoh: Dell"', item?.brand) +
    field("Model (opsional)", "model", 'maxlength="60" placeholder="Contoh: Latitude 5440"', item?.model) +
    field("Stok minimum", "minimum", 'type="number" min="0" max="1000000000" step="1" required', item?.minimum ?? 0, true);
  dialog.innerHTML = '<div class="dialog-head"><h2 id="dialog-title">' + title + '</h2>' + action("close", "", "Tutup", "close") +
    '</div><form><div class="form-grid">' + fields + '</div>' +
    (movement ? '<p id="current-stock"></p>' : '<p><small>Saldo diperbarui dari menu mutasi.</small></p>') +
    '<p class="dialog-error" role="alert"></p><div class="actions">' + button("close", "Batal") +
    '<button type="submit" class="btn primary">Simpan</button></div></form>';
  const form = dialog.querySelector("form");
  const controls = form.elements;
  function movementLabels() {
    const kind = controls.kind.value;
    const record = items.find((item) => item.id === controls.itemId.value);
    el("#current-stock").textContent = "Saldo saat dimuat: " + num.format(record.stock) + " " + record.unit;
    el("#quantity-label").textContent = { in: "Jumlah masuk", out: "Jumlah keluar", count: "Hasil hitung fisik" }[kind];
    controls.quantity.min = kind === "count" ? 0 : 1;
    controls.note.required = kind === "count";
    controls.note.placeholder = kind === "count" ? "Wajib diisi, misalnya selisih hitung" : "Opsional";
  }
  let movementId = crypto.randomUUID();
  let lastPayload = "";
  if (movement) {
    movementLabels();
    form.addEventListener("change", movementLabels);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const save = form.querySelector('[type="submit"]');
    if (save.disabled) return;
    const errorLine = dialog.querySelector(".dialog-error");
    const input = Object.fromEntries(new FormData(form));
    if (movement) {
      input.quantity = Number(input.quantity);
      if (input.kind === "count") input.expectedStock = items.find((item) => item.id === input.itemId).stock;
      const payload = JSON.stringify(input);
      if (lastPayload && payload !== lastPayload) movementId = crypto.randomUUID();
      lastPayload = payload;
      input.id = movementId;
    } else input.minimum = Number(input.minimum);
    save.disabled = true;
    form.setAttribute("aria-busy", "true");
    errorLine.textContent = "";
    try {
      await request(movement ? "/api/movements" : edit ? "/api/items/" + id : "/api/items", edit ? "PATCH" : "POST", input);
      dialog.close();
      notify(movement ? "Mutasi tersimpan." : "Barang tersimpan.");
      await refresh();
    } catch (error) {
      errorLine.textContent = error.message;
      if (error.message.includes("Saldo berubah")) {
        const data = await request("/api/snapshot").catch(() => null);
        if (data) {
          for (const item of items) {
            const current = data.items.find((record) => record.id === item.id);
            if (current) item.stock = current.stock;
          }
          movementLabels();
        }
      }
    } finally {
      save.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
  dialog.showModal();
}

dialog.addEventListener("cancel", (event) => {
  if (dialog.querySelector('form[aria-busy="true"]')) event.preventDefault();
});
el("#warehouse-icon").innerHTML = icon("warehouse");
el("#refresh").innerHTML = icon("refresh");
document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const { act, id, format } = target.dataset;
  if (act === "refresh") await refresh();
  if (act === "close" && !dialog.querySelector('form[aria-busy="true"]')) dialog.close();
  if (["item", "edit", "movement"].includes(act)) openForm(act, id);
  if (act === "import" && !state.demo && state.fresh) openImport({ dialog, request, refresh, notify });
  if (act === "watch") {
    state.itemStatus = "attention";
    state.category = "";
    state.search = "";
    if (route() === "barang") render();
    else location.hash = "barang";
  }
  if (act === "demo") {
    state.demo = !state.demo;
    state.category = "";
    state.reportCategory = "";
    const url = new URL(location.href);
    if (state.demo) url.searchParams.set("contoh", "1");
    else url.searchParams.delete("contoh");
    history.replaceState(null, "", url);
    render();
  }
  if (act === "export") {
    target.disabled = true;
    try {
      await downloadReport(reportData(), format);
      notify("Laporan " + format.toUpperCase() + " diunduh.");
    } catch (error) {
      console.error(error);
      notify("Laporan gagal dibuat. Coba lagi.");
    } finally {
      target.disabled = false;
    }
  }
});
view.addEventListener("input", (event) => {
  const { id, value } = event.target;
  if (id === "search" || id === "movementSearch") {
    state[id] = value;
    el("#results").innerHTML = id === "search" ? itemRows() : movementRows();
  }
});
view.addEventListener("change", (event) => {
  const { id, value } = event.target;
  if (["category", "itemStatus", "movementKind", "reportType", "reportCategory", "from", "until", "period"].includes(id)) {
    state[id] = id === "period" ? Number(value) : value;
    if (id === "reportType" || id === "period") {
      render();
      el("#" + id)?.focus();
    } else if (route() === "barang") el("#results").innerHTML = itemRows();
    else if (route() === "mutasi") el("#results").innerHTML = movementRows();
    else if (route() === "laporan") el("#report-result").innerHTML = reportResult();
  }
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") return;
  render();
  el("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
render();
refresh();
