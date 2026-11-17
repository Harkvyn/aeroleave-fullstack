# AeroLeave Global — International Flight Booking & Corporate Travel

Aplikasi full-stack **Zero-Dependency Node.js** yang meningkatkan prototype **US1–US9** menjadi platform pemesanan tiket pesawat internasional & manajemen travel korporat:

- **14 Bandara Internasional & Domestik** (`CGK`, `DPS`, `SUB`, `YIA`, `UPG`, `SIN`, `KUL`, `HND`, `ICN`, `DXB`, `DOH`, `LHR`, `CDG`, `SYD`) lengkap dengan foto bandara eksternal (Wikimedia Commons + fallback SVG otomatis), jam lokal per zona waktu (`Intl.DateTimeFormat`), daftar terminal, lounge, fasilitas, dan papan jadwal FIDS.
- **Pencarian Penerbangan Internasional & Multi-Kabin**: `Economy`, `Premium Economy`, `Business`, `First`, filter transit/maskapai/cakupan, tampilan pasangan foto bandara asal-tujuan, serta konversi mata uang real-time (`IDR`, `USD`, `SGD`, `JPY`, `EUR`, `GBP`, `AUD`).
- **Alur Booking End-to-End 4 Langkah**: Paket tarif (`Lite` / `Standard` / `Flex`), data penumpang & paspor, **Interactive Cabin Seat Map** (`GET /api/flights/:flightId/seats`), serta **Checkout Pembayaran** (`POST /api/bookings/:idOrRef/pay`) dan **E-Tiket / Boarding Pass QR siap cetak** (`GET /api/bookings/:idOrRef/boarding-pass`).
- **Tetap Mempertahankan Seluruh API & Pengujian US1–US9**: Manajemen Cuti HRD, Frequent Traveller (Multi-City, Validasi Profil, Komparasi Tarif), serta Konsol Manajer Travel & Pengunjung.

## Struktur Direktori

```
aeroleave-fullstack/
├── server.js                 # Entrypoint server HTTP & test runner (--test)
├── data_store.json           # Penyimpanan state persisten JSON
├── src/
│   ├── data/
│   │   ├── airports.js       # Katalog 14 bandara, koordinat peta, URL foto & terminal
│   │   └── seed.js           # Seed awal US1–US9 + rute internasional & kurs mata uang
│   ├── helpers.js            # Logika domain, seat map kabin & kalkulasi tarif
│   ├── store.js              # Persistensi & migrasi aman data_store.json
│   ├── routes.js             # Router REST API & static file server public/
│   └── tests.js              # 24 pengujian integrasi (19 US1–US9 + 5 Pro Intl)
└── public/
    ├── index.html            # Shell aplikasi web
    ├── css/app.css           # Design system & layout responsif + print boarding pass
    └── js/
        ├── utils.js          # Mata uang, zona waktu bandara, SVG QR generator & fallback
        ├── api.js            # Klien REST API
        ├── components.js     # Peta rute SVG, modal bandara/FIDS, wizard checkout & boarding pass
        └── app.js            # Controller utama 5 tampilan (Penerbangan, Bandara, Perjalanan, Club, Corporate)
```

## Cara Menjalankan

```bash
# Jalankan server (http://localhost:4000)
node server.js

# Jalankan seluruh 24 pengujian integrasi otomatis
node server.js --test
```
