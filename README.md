# Ruang Stok

Aplikasi inventaris perangkat dan perlengkapan IT untuk satu gudang dalam bahasa Indonesia. Waktu pada dasbor dan laporan menggunakan WITA.

## Menjalankan di Windows

Di PowerShell, buka folder ini dan jalankan dengan Node.js 24 atau lebih baru.

```powershell
node scripts/build.mjs
node scripts/local.mjs
```

Buka http://127.0.0.1:4317. Hentikan server dengan Ctrl+C. Data lokal disimpan di `data/inventory.sqlite` dan terpisah dari data online. Gunakan `?contoh=1` untuk membuka katalog contoh tanpa menulis data gudang.

## Alur penggunaan

1. Tambahkan perangkat atau perlengkapan dengan SKU unik, kategori IT, satuan, dan stok minimum. Isi merek dan model bila tersedia.
2. Catat saldo awal sebagai mutasi masuk. Untuk pengeluaran, pilih Keluar. Untuk hitung fisik, pilih Opname dan isi jumlah hasil hitung beserta alasannya.
3. Pilih jenis laporan dan kategori. Untuk riwayat mutasi, pilih tanggal awal dan akhir. Unduh XLSX, CSV UTF-8, atau PDF yang menyertakan merek dan model.
4. Untuk menambahkan banyak barang sekaligus, buka **Barang → Impor Excel / CSV**. Unduh templat, isi maksimal 200 baris, lalu periksa pratinjau sebelum mengimpor. Gunakan sheet pertama untuk XLSX dan UTF-8 untuk CSV. Kolom SKU, Nama barang, Kategori IT, dan Satuan wajib ada. Stok minimum dan stok awal yang kosong diperlakukan sebagai nol. Simpan SKU berawalan nol sebagai teks.
5. Gunakan ikon segarkan di dasbor desktop atau muat ulang halaman untuk mengambil perubahan dari sesi lain.

Impor hanya menambahkan SKU baru. SKU ganda dan baris tidak valid harus diperbaiki sebelum seluruh berkas dapat disimpan. Stok awal positif dicatat sebagai mutasi masuk. Barang, mutasi, dan tanda terima impor ditulis dalam satu transaksi agar pengulangan permintaan yang sama tidak menggandakan saldo.

Mutasi memperbarui saldo secara atomik dan menolak saldo negatif. Opname memeriksa saldo acuan. Satuan terkunci sesudah mutasi pertama agar angka historis tetap bermakna. Nama, SKU, merek, model, dan kategori yang ditampilkan atau dipakai untuk filter riwayat mengikuti master barang saat laporan dibuat. Data dari kategori lama tetap dapat dibuka dan diedit. Kategori lama dapat dipertahankan atau dipindah ke kategori IT. PDF memakai halaman gambar beresolusi tinggi. Gunakan XLSX atau CSV jika isi perlu disalin, dicari, atau diolah.

## Penyimpanan dan akses online

Worker menggunakan binding D1 bernama `DB` dan identitas yang diteruskan oleh Sites. Aplikasi dibangun untuk Site privat. Baris inventaris dipisah menurut ID pemilik. SQLite lokal menggantikan binding D1 saat pengembangan dan hanya mendengarkan pada loopback. Gunakan satu inventaris privat untuk tahap awal. Pemakaian tim perlu rancangan keanggotaan dan hak akses sebelum data dibagikan.

```powershell
node scripts/validate-artifact.mjs
```

SQL awal ada di `drizzle/0000_inventory.sql`. Migrasi `drizzle/0001_it_catalog.sql` menambah kolom merek dan model. Migrasi `drizzle/0002_import_batches.sql` menambah tanda terima impor. Server lokal menerapkan migrasi dari jurnal saat mulai. Pembaca XLSX memakai SheetJS CE 0.20.3 yang disalin dari distribusi resmi dan dimuat saat file XLSX dipilih. Lihat lisensinya di `web/vendor/LICENSE-sheetjs.txt`. Mode pengujian terisolasi tersedia melalui `RUANG_STOK_EPHEMERAL=1` dan port dapat dipilih melalui `RUANG_STOK_PORT`.
