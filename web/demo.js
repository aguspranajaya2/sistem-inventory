import { itCategories } from "./catalog.js";

// Sample records use a separate, read-only view.
export function demoData(now = new Date()) {
  const catalogue = [
    ["PC-014", "Laptop kerja 14 inci", "Komputer & server", "unit", 5, 15, "Dell", "Latitude 5440"],
    ["NET-026", "Switch Gigabit 8 port", "Jaringan", "unit", 4, 9, "TP-Link", "TL-SG108"],
    ["CMP-031", "SSD NVMe 1 TB", "Penyimpanan & komponen", "unit", 8, 15, "Samsung", "990 EVO"],
    ["PER-008", "Monitor kerja 24 inci", "Monitor & periferal", "unit", 5, 12, "Dell", "P2422H"],
    ["PER-011", "Mouse USB", "Monitor & periferal", "pcs", 12, 14, "Logitech", "B100"],
    ["CAB-024", "Kabel USB-C", "Kabel & adaptor", "pcs", 6, 12, "", "USB-C ke USB-C"],
    ["PWR-003", "UPS cadangan", "Daya & UPS", "unit", 2, 6, "APC", "Back-UPS"],
    ["PRN-017", "Toner printer hitam", "Printer & bahan cetak", "pcs", 6, 12, "HP", "26A"]
  ];
  const items = catalogue.map(([sku, name, category, unit, minimum, opening, brand, model], i) => {
    if (!itCategories.includes(category)) throw new Error("Kategori contoh tidak valid: " + category);
    return { id: "demo-" + i, sku, name, category, unit, minimum, stock: 0, brand, model };
  });
  const movements = [];
  function post(i, daysAgo, delta, note, kind = delta >= 0 ? "in" : "out") {
    const item = items[i];
    item.stock += delta;
    const at = new Date(now.getTime() - daysAgo * 86400000 - (movements.length % 9) * 60000).toISOString();
    movements.push({ id: "demo-m-" + movements.length, itemId: item.id, kind, delta, balance: item.stock, note, at });
  }
  catalogue.forEach((record, i) => post(i, 8, record[5], "Saldo awal"));
  for (const event of [
    [0, 6, -4, "Penyiapan perangkat kerja"], [5, 6, -4, "Pemasangan ruang rapat"],
    [3, 5, 7, "Penerimaan pemasok"], [2, 5, -8, "Peningkatan kapasitas laptop"],
    [0, 4, 6, "Penerimaan pemasok"], [7, 4, -4, "Penggantian toner"],
    [6, 3, -2, "Pemasangan di rak jaringan"], [4, 3, -9, "Permintaan perangkat kerja"],
    [1, 2, -6, "Pemasangan jaringan kantor"], [5, 2, 6, "Penerimaan pemasok"],
    [3, 1, -6, "Penyiapan meja kerja"], [2, 1, -2, "Selisih hitung fisik", "count"],
    [7, 1, -8, "Distribusi ke ruang cetak"], [0, 0, -3, "Penyiapan laptop cadangan"],
    [6, 0, 2, "Penerimaan pemasok"]
  ]) post(...event);
  return { items, movements: movements.sort((a, b) => b.at.localeCompare(a.at)) };
}
