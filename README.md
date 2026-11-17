# AeroLeave Global — Flight Booking, Travel Agency Ops & HR Leave Management

Aplikasi full-stack **Zero-Dependency Node.js (`v22.5+`)** dengan penyimpanan **SQLite relasional (`node:sqlite`)**, **autentikasi sesi + RBAC 5 aktor dunia nyata**, serta antarmuka **Cobalt-Paper** yang modular untuk pemesanan tiket pesawat online, loket agen offline, manajemen cuti karyawan (HRD), dan operasional travel (`US1–US9` + International Pro).

## 5 Aktor Dunia Nyata & Hak Akses (RBAC)

Seluruh akun demo memakai kata sandi default `aeroleave123` atau dapat dipilih langsung lewat **Portal Aktor** di pojok kanan atas:

| Aktor | Akun Demo | Kemampuan Utama & Batasan |
| --- | --- | --- |
| **Visitor (Customer / Pengguna)** | `dimas.anggara@visitor.id`, `larasati.putri@visitor.id` | Cari jadwal, pesan tiket pesawat online (multi-penumpang + pilih kursi), bayar/batalkan tiket sendiri, cetak boarding pass, dan melihat tiket/email dari pemesanan offline agen. |
| **Frequent Traveller** | `raka.mahendra@example.id` (Platinum), `nadia.kusuma@example.id` (Gold) | Semua fitur booking plus Multi-City (`US4`), melengkapi profil paspor/FFN & validasi tiket (`US5`), komparasi tarif + miles (`US6`), serta pengembalian poin saat batal. |
| **Employee (Karyawan / Agen Tiket)** | `budi.santoso@ooalah.id`, `siti.rahmawati@ooalah.id`, `andi.pratama@ooalah.id` | Karyawan internal perusahaan travel: melihat kuota & mengajukan cuti ke HRD, **serta melayani pemesanan tiket pelanggan secara offline (loket walk-in)** + pesan tiket sendiri. |
| **HR Manager (HRD)** | `dewi.lestari@ooalah.id` | Mengelola & memfilter seluruh jadwal cuti pegawai, **menyetujui / menolak** pengajuan cuti (`pending` -> `approved`/`rejected`) dengan validasi kuota transaksional, serta memantau audit HR. |
| **Manajer Travel** | `travel.manager@ooalah.id` | Memantau semua status booking online/offline (`US7`), memesankan tiket untuk Visitor (`US8`), serta mengotorisasi/menolak booking PNR `HLM-*` (`US9`) + audit travel. |

## Fitur Utama & Penyimpanan SQLite

- **SQLite Relasional (`aeroleave.db`)**: 13 tabel ternormalisasi (`meta_kv`, `airports`, `employees`, `frequent_travellers`, `visitors`, `users`, `sessions`, `leave_requests`, `flights`, `bookings`, `booking_passengers`, `email_notifications`, `audit_logs`) dengan `FOREIGN KEY`, indeks pencarian, mode `WAL`, dan transaksi atomik (`BEGIN IMMEDIATE`) untuk mencegah double-booking kursi atau pengurangan kuota ganda.
- **14 Bandara Internasional & Domestik**: Peta jaringan rute SVG dengan siluet geografis benua/kepulauan, sorot hub aktif, jam lokal tiap zona waktu, daftar terminal, lounge, dan papan FIDS.
- **Alur Booking Multi-Penumpang 4 Langkah**: Paket tarif (`Lite`/`Standard`/`Flex`), kanal pemesanan (`Online` / `Loket Offline` untuk staff/manajer), input 1–4 penumpang + pemilihan kursi kabin per penumpang, checkout pembayaran (`Bayar Sekarang`, `Bayar Nanti / Waiting for the Payment`, atau `Booked`), dan E-Tiket / Boarding Pass QR siap cetak sesuai status asli reservasi.

## Ringkasan Pembaruan (Update Log)

1. **Migrasi Penyimpanan JSON -> SQLite (`node:sqlite`, Zero Dependency)**
   - Menggantikan penulisan flat file `data_store.json` di [src/store.js](src/store.js) dengan skema SQLite relasional di [src/db.js](src/db.js) dan [src/store.js](src/store.js).
   - Menambahkan tabel `users`, `sessions`, `booking_passengers`, dan `audit_logs` beserta pemeriksaan bentrok kursi (`409 Conflict`), validasi sisa kuota & bentrok tanggal cuti, serta pengembalian poin miles Frequent Traveller saat pembatalan tiket.
   - Mengisolasi eksekusi test `npm test` menggunakan database sementara di `os.tmpdir()` agar `aeroleave.db` utama tidak tertimpa.

2. **Autentikasi, RBAC 5 Aktor & Penyesuaian Skenario Dunia Nyata**
   - Menambahkan hashing kata sandi `scrypt`, sesi cookie `HttpOnly` / header `Bearer`, dan guard RBAC di [src/auth.js](src/auth.js), [src/http.js](src/http.js), dan [src/routes/authRoutes.js](src/routes/authRoutes.js).
   - Membatasi `/api/state` berdasarkan peran aktif (`Guest` hanya menerima katalog publik bandara dan jadwal penerbangan).
   - Mengembalikan model bisnis aplikasi ke **booking tiket pesawat umum + loket offline agen + HR internal perusahaan**:
     - **Visitor (Customer)** dapat melakukan pemesanan tiket mandiri, membayar, mencetak boarding pass, dan membatalkan tiketnya sendiri sekaligus menerima tiket/email yang dipesankan agen secara offline.
     - **Employee (Staff)** memiliki tab **Loket & Cuti** untuk melayani pemesanan offline pelanggan walk-in (`POST /api/travel-manager/bookings/visitor`) serta melihat kuota & mengajukan cuti pribadi ke HRD.
     - **HR Manager** mendapat aksi **Setujui / Tolak** pengajuan cuti (`POST /api/hr/leaves/:leaveId/decision`), filter rentang periode (`#hrEnd`), filter status, dan log audit HR.
     - **Travel Manager** mendapat tombol otorisasi cepat di tabel monitor, aksi tolak PNR, serta pemblokiran mutasi via `GET /api/travel-manager/authorize/:ref` (`405 Method Not Allowed`).

3. **Modularisasi Backend & Frontend ES Modules**
   - Memecah [src/routes.js](src/routes.js) menjadi 6 modul rute: `authRoutes.js`, `catalogRoutes.js`, `hrRoutes.js`, `bookingRoutes.js`, `ftRoutes.js`, dan `travelManagerRoutes.js`.
   - Memecah monolit frontend lama (`app.js` & `components.js`) menjadi ES Modules terstruktur di `public/js/state.js`, `public/js/components/` (`modal.js`, `authModal.js`, `worldMap.js`, `airportModal.js`, `checkoutWizard.js`, `boardingPass.js`), dan `public/js/views/` (`flightsView.js`, `airportsView.js`, `tripsView.js`, `clubView.js`, `corporateView.js`).

4. **Polish UI/UX & Perbaikan Bug**
   - **Layout & Responsivitas ([public/css/app.css](public/css/app.css))**: Memperbaiki `.search-grid` dari 7 kolom menjadi 6 kolom sesuai elemen form, mengganti inline grid pada kartu perjalanan dengan `.flight-card--trip` agar rapi di tablet/mobile, dan merapikan `.bp-route-header` / `.hero-airport-badge` pada layar kecil.
   - **Peta Rute Dunia ([public/js/components/worldMap.js](public/js/components/worldMap.js))**: Menambahkan poligon siluet benua & kepulauan Nusantara yang terproyeksi akurat, pilihan hub interaktif (`selectedCode`) dengan sorotan rute amber, serta ringkasan hub langsung di bawah peta.
   - **Wizard Booking & Boarding Pass**: Mendukung 1–4 penumpang beserta pemetaan kursi kabin per penumpang, menampilkan status stub boarding pass secara akurat (`SIAP BOARDING` hanya saat `confirmed`), mendukung tutup modal dengan tombol `Escape` + pengembalian fokus, dialog konfirmasi sebelum pembatalan/reset demo, serta menyambungkan filter jam `#clubCmpTime`, hasil Multi-City, dan panel konfirmasi booking member di [public/js/views/clubView.js](public/js/views/clubView.js).

## Struktur Direktori

```
aeroleave-fullstack/
├── server.js                        # Entrypoint HTTP server & test runner (--test)
├── aeroleave.db                     # Database SQLite aktif (dibuat otomatis saat startup)
├── src/
│   ├── auth.js                      # Hashing scrypt, session cookie/bearer & RBAC policy
│   ├── db.js                        # Skema SQLite, transaksi, mapper & seed database
│   ├── http.js                      # Helper JSON response, parsing & auth/role guards
│   ├── store.js                     # Repository & operasi bisnis transaksional SQLite
│   ├── helpers.js                   # Seat map kabin, kalkulasi tarif, overlap & ringkasan cuti
│   ├── routes.js                    # Dispatcher REST API & static file server public/
│   ├── routes/                      # Handler modular (auth, catalog, hr, booking, ft, travelManager)
│   ├── data/
│   │   ├── airports.js              # Katalog 14 bandara, koordinat peta, URL foto & terminal
│   │   └── seed.js                  # Seed awal 5 aktor, US1–US9, rute internasional & audit log
│   └── tests.js                     # 48 pengujian integrasi SQLite, RBAC, US1–US9 & Pro Intl
└── public/
    ├── index.html                   # Shell aplikasi web (ES Modules)
    ├── css/app.css                  # Design system Cobalt-Paper responsif & print boarding pass
    └── js/
        ├── utils.js                 # Mata uang, zona waktu, SVG QR, filter waktu & helper DOM
        ├── api.js                   # Klien REST API berbasis cookie/JSON
        ├── state.js                 # State UI terpusat & kontrol visibilitas peran
        ├── app.js                   # Controller utama aplikasi
        ├── components/              # modal.js, authModal.js, worldMap.js, airportModal.js, checkoutWizard.js, boardingPass.js
        └── views/                   # flightsView.js, airportsView.js, tripsView.js, clubView.js, corporateView.js
```

## Cara Menjalankan

```bash
# Jalankan server (http://localhost:4000)
npm start
# atau langsung:
node --no-warnings server.js

# Jalankan seluruh 48 pengujian integrasi otomatis (menggunakan DB uji terisolasi di tmpdir)
npm test
```
