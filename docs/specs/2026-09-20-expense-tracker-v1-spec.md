# Spec: Personal Expense Tracker v1 (Lokal, ala Jago)

## Problem Statement

Pengguna membutuhkan pencatat pengeluaran/pemasukan pribadi yang cepat dibuka,
mudah dipakai satu tangan, dan datanya tetap di HP sendiri. Aplikasi bank
memberi inspirasi UI (kantong/pockets) tapi tidak cocok untuk budgeting
pribadi yang fleksibel dan offline-first.

## Solution

Aplikasi React Native (Expo) offline-first dengan dashboard ringkasan di home,
navigasi bawah 5 slot dengan tombol CREATE tengah untuk catat expense/income
dalam 1-2 tap, Kantong ala Jago dengan budget per kantong, dan PIN lock lokal.
Database SQLite lokal via Drizzle ORM. Target size release ~28-35MB Android.

## User Stories

1. As a pengguna, I want to melihat total saldo + ringkasan bulan ini di dashboard, so that saya tahu kondisi keuangan sekilas.
2. As a pengguna, I want to melihat daftar kantong horizontal dengan progress budget, so that saya tahu sisa tiap pos.
3. As a pengguna, I want to melihat 10 transaksi terakhir di home, so that saya ingat aktivitas terakhir.
4. As a pengguna, I want to menekan tombol CREATE di bottom nav, so that saya bisa mencatat tanpa cari menu.
5. As a pengguna, I want to memilih expense/income langsung di bottom sheet, so that pencatatan cepat.
6. As a pengguna, I want to memasukkan nominal dengan numpad auto-focus, so that input cepat satu tangan.
7. As a pengguna, I want to memilih kantong tujuan saat mencatat, so that saldo kantong akurat.
8. As a pengguna, I want to memilih kategori via chips, so that klasifikasi konsisten.
9. As a pengguna, I want to menyimpan transaksi dalam 1 tap, so that tidak menunda mencatat.
10. As a pengguna, I want to membuat/mengubah/menghapus kantong, so that struktur pos mengikuti kebutuhan.
11. As a pengguna, I want to menetapkan budget per kantong, so that ada batas belanja.
12. As a pengguna, I want to memindah dana antar kantong, so that alokasi fleksibel.
13. As a pengguna, I want to melihat grafik pemasukan vs pengeluaran bulanan, so that evaluasi pola belanja.
14. As a pengguna, I want to membuka aplikasi dengan PIN, so that data aman bila HP dipinjam.
15. As a pengguna, I want to membuka dengan biometrik bila tersedia, so that login cepat.
16. As a pengguna, I want to data tersimpan lokal walau offline, so that bisa dipakai kapan saja.
17. As a pengguna, I want to aplikasi tetap ringan dan cepat dibuka, so that tidak malas mencatat.

## Implementation Decisions

- Modul yang dibangun: Dashboard, Pockets, QuickCreate (FAB + bottom sheet expense/income), Stats, Settings/PIN. Satu seam utama: pencatatan transaksi yang sekaligus memutasi saldo pocket dalam satu transaksi database atomik — semua UI (home, kantong, stats) membaca dari hasil seam ini.
- Arsitektur: Expo Managed SDK 54 + TypeScript + Expo Router (tabs). State server via live query Drizzle, state UI via store ringan.
- Skema v1: pockets (saldo, budget_limit), transactions (tipe expense/income, nominal, kategori, kantong, tanggal, catatan), categories. Index pada tanggal transaksi; home hanya agregat + 10 baris terakhir dengan pagination 30-50 untuk list penuh.
- Navigasi: bottom tabs Home, Kantong, CREATE (tengah, FAB), Stats, Setting. CREATE membuka bottom sheet, bukan halaman penuh.
- Keamanan v1 (tanpa SQLCipher agar cepat): hash PIN + salt di SecureStore (Keystore/Keychain), auto-lock saat background 2 menit, backup sistem dimatikan untuk DB. SQLCipher full-DB encryption dijadwalkan v2 karena butuh dev-build dan migrasi data.
- Performa/size: Hermes + FlashList + NativeWind, hindari modul native berat (kamera, maps, AV) agar release AAB tetap 28-35MB via EAS production build.
- Kontrak perilaku: simpan transaksi gagal bila nominal <= 0 atau kantong tidak ada; pindah dana adalah dua mutasi saldo dalam satu transaksi atomik.

## Testing Decisions

- Uji perilaku luar, bukan detail implementasi: pencatatan menambah/mengurangi saldo dengan benar, budget bar proporsional, PIN salah ditolak, aplikasi dibuka offline tetap menampilkan data.
- Modul yang diuji: seam pencatatan transaksi + mutasi saldo, agregat dashboard, validasi form QuickCreate.
- Prior art: belum ada test di repo (greenfield); mulai dari test integrasi ringan untuk seam utama + manual QA checklist (cold start < 2s, list 500 transaksi smooth).

## Out of Scope

- Sinkronisasi cloud, multi-device, share antar pengguna.
- Import mutasi bank otomatis, OCR struk, export CSV/PDF.
- Enkripsi full-DB SQLCipher (v2), backup terenkripsi (v2).
- iOS release, widget home screen, notifikasi pengingat.
- Grafik advanced (heatmap, forecast) dan multi-currency.

## Further Notes

- Terinspirasi visual Jago (kartu kantong, bahasa sederhana) tanpa meniru aset/brand.
- Repo: https://github.com/rifqieali/expenseTracker-ReactNative — v1 fokus kecepatan development untuk pemula mobile.
- Seams diusulkan: satu seam (record-transaction-and-mutate-balance). Jika saat implementasi perlu seam baru (mis. auth-unlock), usulkan di level tertinggi (unlock-gate sebelum DB dibuka).
