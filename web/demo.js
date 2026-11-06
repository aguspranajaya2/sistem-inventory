// Sample records use a separate, read-only view.
export function demoData(now = new Date()) {
  const catalogue = [
    ["KMS-014", "Kardus 30 × 20 cm", "Kemasan", "pcs", 25, 80],
    ["KMS-026", "Lakban bening 48 mm", "Kemasan", "rol", 12, 22],
    ["KMS-031", "Plastik bubble wrap", "Kemasan", "rol", 8, 15],
    ["ATK-008", "Kertas A4 80 gsm", "Alat tulis", "rim", 10, 28],
    ["ATK-011", "Spidol permanen hitam", "Alat tulis", "pcs", 12, 14],
    ["ATK-024", "Label termal 100 × 150 mm", "Alat tulis", "rol", 6, 12],
    ["OPR-003", "Sarung tangan nitril", "Operasional", "kotak", 8, 16],
    ["OPR-017", "Cairan pembersih 1 L", "Operasional", "botol", 6, 12]
  ];
  const items = catalogue.map(([sku, name, category, unit, minimum], i) =>
    ({ id: "demo-" + i, sku, name, category, unit, minimum, stock: 0 }));
  const movements = [];
  function post(i, daysAgo, delta, note, kind = delta >= 0 ? "in" : "out") {
    const item = items[i];
    item.stock += delta;
    const at = new Date(now.getTime() - daysAgo * 86400000 - (movements.length % 9) * 60000).toISOString();
    movements.push({ id: "demo-m-" + movements.length, itemId: item.id, kind, delta, balance: item.stock, note, at });
  }
  catalogue.forEach((record, i) => post(i, 8, record[5], "Saldo awal"));
  for (const event of [
    [0, 6, -28, "Pengiriman pesanan"], [5, 6, -4, "Label pengiriman"],
    [3, 5, 16, "Penerimaan pemasok"], [2, 5, -8, "Persiapan kemasan"],
    [0, 4, 36, "Penerimaan pemasok"], [7, 4, -4, "Pemakaian operasional"],
    [6, 3, -9, "Pemakaian operasional"], [4, 3, -9, "Permintaan tim"],
    [1, 2, -14, "Pemakaian kemasan"], [5, 2, 6, "Penerimaan pemasok"],
    [3, 1, -18, "Permintaan tim"], [2, 1, -2, "Selisih hitung fisik", "count"],
    [7, 1, -8, "Pemakaian operasional"], [0, 0, -19, "Pengiriman pesanan"],
    [6, 0, 4, "Penerimaan pemasok"]
  ]) post(...event);
  return { items, movements: movements.sort((a, b) => b.at.localeCompare(a.at)) };
}
