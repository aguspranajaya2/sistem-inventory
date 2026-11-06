import { importLimit, itCategories } from "./catalog.js";
import { importTemplate, parseImportFile } from "./import-file.js";
import { downloadReport } from "./reports.js";

function showRows(container, rows) {
  const table = document.createElement("table");
  table.setAttribute("aria-label", "Pratinjau baris impor");
  const header = table.createTHead().insertRow();
  for (const label of ["Baris", "SKU", "Nama barang", "Kategori IT", "Satuan", "Minimum", "Stok awal", "Hasil pemeriksaan"]) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = label;
    header.append(heading);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    const values = [row.line, row.sku, row.name, row.category, row.unit, row.minimum, row.opening, row.error || "Siap"];
    values.forEach((value, index) => {
      const cell = tr.insertCell();
      cell.textContent = value ?? "—";
      if ([0, 5, 6].includes(index)) cell.classList.add("num");
      if (index === 2 && (row.brand || row.model)) {
        const detail = document.createElement("small");
        detail.textContent = [row.brand, row.model].filter(Boolean).join(" · ");
        cell.append(detail);
      }
      if (index === 7 && row.error) cell.classList.add("error");
    });
  }
  container.replaceChildren(table);
  container.hidden = false;
}

export function openImport({ dialog, request, refresh, notify }) {
  dialog.classList.add("import-dialog");
  dialog.addEventListener("close", () => dialog.classList.remove("import-dialog"), { once: true });
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">Impor barang IT</h2>
    <button type="button" class="btn link" data-act="close">Tutup</button></div>
    <p class="import-guide">Pilih berkas .xlsx atau CSV UTF-8 hingga ${importLimit} baris dan 2 MB. Gunakan sheet pertama di Excel dan isi SKU baru. Stok awal yang positif akan dicatat sebagai mutasi masuk.</p>
    <form class="import-form">
      <div class="import-tools"><label class="field">Berkas inventaris<span class="file-control"><span class="btn" aria-hidden="true">Pilih berkas</span><input type="file" aria-label="Berkas inventaris" accept=".xlsx,.csv"></span></label>
      <button type="button" class="btn" data-template="xlsx">Templat Excel</button>
      <button type="button" class="btn" data-template="csv">Templat CSV</button></div>
      <details class="import-categories"><summary>Lihat kategori IT yang diterima</summary><p></p></details>
      <p class="import-status" role="status" aria-live="polite">Pilih berkas untuk memeriksa baris sebelum menyimpan.</p>
      <div class="import-preview" role="region" aria-label="Hasil pemeriksaan" tabindex="0" hidden></div>
      <div class="actions"><button type="button" class="btn" data-act="close">Batal</button>
      <button type="submit" class="btn primary" disabled>Impor barang</button></div>
    </form>`;
  const form = dialog.querySelector("form");
  const input = form.querySelector('input[type="file"]');
  const status = form.querySelector(".import-status");
  const preview = form.querySelector(".import-preview");
  const submit = form.querySelector('button[type="submit"]');
  form.querySelector(".import-categories p").textContent = itCategories.join(" · ");
  let staged;
  let selection = 0;
  function showStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  for (const button of form.querySelectorAll("[data-template]")) {
    button.addEventListener("click", async () => {
      try {
        await downloadReport(importTemplate, button.dataset.template);
      } catch {
        showStatus("Templat gagal diunduh. Coba lagi.", true);
      }
    });
  }

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    input.value = "";
    const current = ++selection;
    const active = () => dialog.open && form.isConnected && current === selection;
    staged = undefined;
    submit.disabled = true;
    preview.hidden = true;
    preview.replaceChildren();
    showStatus("Memeriksa " + file.name + "…");
    try {
      const rows = await parseImportFile(file);
      if (!active()) return;
      const result = await request("/api/import/preview", "POST", { rows });
      if (!active()) return;
      showRows(preview, result.rows);
      const errors = result.rows.filter((row) => row.error).length;
      if (errors) {
        showStatus(file.name + " · " + errors + " dari " + rows.length + " baris perlu diperbaiki. Pilih ulang berkas setelah diperbaiki.", true);
        return;
      }
      staged = { id: crypto.randomUUID(), rows };
      showStatus(file.name + " · " + rows.length + " barang siap diimpor.");
      submit.disabled = false;
    } catch (error) {
      if (active()) showStatus(file.name + " · " + error.message, true);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!staged || submit.disabled) return;
    submit.disabled = true;
    input.disabled = true;
    form.setAttribute("aria-busy", "true");
    showStatus("Menyimpan barang dan stok awal…");
    try {
      const result = await request("/api/import", "POST", staged);
      dialog.close();
      notify(result.imported + " barang diimpor · " + result.openings + " mutasi stok awal.");
      await refresh();
    } catch (error) {
      showStatus(error.message, true);
      if (error.rows) {
        showRows(preview, error.rows);
        staged = undefined;
      }
    } finally {
      form.removeAttribute("aria-busy");
      input.disabled = false;
      submit.disabled = !staged;
    }
  });
  dialog.showModal();
}
