# Ruang Stok

Aplikasi inventaris satu gudang dalam bahasa Indonesia. Waktu pada dasbor dan laporan menggunakan WITA.

## Menjalankan di Windows

Di PowerShell, buka folder ini dan jalankan dengan Node.js 24 atau lebih baru.

```powershell
node scripts/build.mjs
node scripts/local.mjs
```

Buka http://127.0.0.1:4317. Hentikan server dengan Ctrl+C. Data lokal disimpan di `data/inventory.sqlite` dan terpisah dari data online. Gunakan `?contoh=1` untuk membuka katalog contoh tanpa menulis data gudang.

## Alur penggunaan

1. Tambahkan barang dengan SKU unik, kategori, satuan, dan stok minimum.
2. Catat saldo awal sebagai mutasi masuk. Untuk pengeluaran, pilih Keluar. Untuk hitung fisik, pilih Opname dan isi jumlah hasil hitung beserta alasannya.
3. Pilih jenis laporan dan kategori. Untuk riwayat mutasi, pilih tanggal awal dan akhir. Unduh XLSX, CSV UTF-8, atau PDF.
4. Gunakan ikon segarkan di dasbor desktop atau muat ulang halaman untuk mengambil perubahan dari sesi lain.

Mutasi memperbarui saldo secara atomik dan menolak saldo negatif. Opname memeriksa saldo acuan. Satuan terkunci sesudah mutasi pertama agar angka historis tetap bermakna. Nama, SKU, dan kategori yang ditampilkan dalam laporan riwayat mengikuti master barang saat laporan dibuat. PDF memakai halaman gambar beresolusi tinggi. Gunakan XLSX atau CSV jika isi perlu disalin, dicari, atau diolah.

## Penyimpanan dan akses online

Worker menggunakan binding D1 bernama `DB` dan identitas yang diteruskan oleh Sites. Aplikasi dibangun untuk Site privat. Baris inventaris dipisah menurut ID pemilik. SQLite lokal menggantikan binding D1 saat pengembangan dan hanya mendengarkan pada loopback. Gunakan satu inventaris privat untuk tahap awal. Pemakaian tim perlu rancangan keanggotaan dan hak akses sebelum data dibagikan.

```powershell
node scripts/validate-artifact.mjs
```

SQL awal ada di `drizzle/0000_inventory.sql`. Simpan perubahan skema berikutnya sebagai migrasi baru. Mode pengujian terisolasi tersedia melalui `RUANG_STOK_EPHEMERAL=1` dan port dapat dipilih melalui `RUANG_STOK_PORT`.
