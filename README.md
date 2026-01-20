# 🤖 WhatsApp Bot - Auto Reply

Bot WhatsApp untuk auto-reply katalog, QRIS, produk, dan ucapan terima kasih dengan fitur cooldown dan exclude.

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Instalasi](#-instalasi)
- [Menjalankan Bot](#-menjalankan-bot)
- [Konfigurasi](#%EF%B8%8F-konfigurasi)
- [Command Owner](#-command-owner)
- [Trigger Auto Reply](#-trigger-auto-reply)
- [File Penting](#-file-penting)
- [Debug & Monitoring](#-debug--monitoring)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Fitur

| Fitur | Deskripsi |
|-------|-----------|
| **Auto-reply Katalog** | Balas otomatis dengan menu/katalog |
| **Auto-reply QRIS** | Kirim template QRIS atau gambar fallback |
| **Auto-reply Produk** | Balas otomatis untuk pertanyaan produk |
| **Auto-reply Terima Kasih** | Balas ucapan terima kasih dari buyer |
| **Cooldown 24 Jam** | Mencegah spam, 1 trigger per 24 jam per user |
| **Runtime Exclude** | Exclude nomor via command WhatsApp |
| **Private Chat Only** | Hanya balas chat pribadi, bukan grup |
| **Rate Limiting** | Delay antar pesan untuk menghindari ban |
| **Auto Reconnect** | Otomatis reconnect jika terputus |
| **Graceful Shutdown** | Simpan data sebelum bot dimatikan (Ctrl+C) |

---

## 📥 Instalasi

### 1. Install Dependencies
```bash
npm install
```

### 2. Buat File `.env`
Copy dari `.env.example` atau buat baru dengan konfigurasi yang dibutuhkan.

### 3. Siapkan QRIS (Opsional)
Letakkan file `qris.png` di folder root untuk fallback QRIS.

---

## ▶️ Menjalankan Bot

### Jalankan Bot
```bash
npm start
```

### Pertama Kali
1. Bot akan menampilkan QR code di terminal
2. Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat
3. Scan QR code
4. Bot siap digunakan!

### Menghentikan Bot
Tekan `Ctrl+C` untuk menghentikan bot dengan aman (data cooldown akan disimpan).

---

## ⚙️ Konfigurasi

Semua konfigurasi ada di file `.env`:

### Pengaturan Umum

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `PRIVATE_CHAT_ONLY` | `true` | Hanya balas chat pribadi |
| `DEBUG` | `true` | Tampilkan log debug |

### Owner

| Variabel | Contoh | Deskripsi |
|----------|--------|-----------|
| `OWNER_NUMBERS` | `6281234567890` | Nomor owner (tanpa +) |
| `OWNER_JIDS` | `123456@lid` | JID owner (dari log) |

### Cooldown

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `MENU_COOLDOWN_HOURS` | `24` | Cooldown menu (jam) |
| `QRIS_COOLDOWN_HOURS` | `24` | Cooldown QRIS (jam) |
| `PRODUCT_COOLDOWN_HOURS` | `24` | Cooldown produk (jam) |
| `THANKS_COOLDOWN_HOURS` | `24` | Cooldown terima kasih (jam) |

### Trigger

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `CATALOG_TRIGGERS` | `menu` | Kata untuk trigger katalog |
| `QRIS_TRIGGERS` | `qris` | Kata untuk trigger QRIS |
| `THANKS_TRIGGERS` | `terimakasih,makasih,...` | Kata untuk trigger terima kasih |

### Reply

| Variabel | Contoh | Deskripsi |
|----------|--------|-----------|
| `CATALOG_TEXT` | `Selamat datang...` | Teks balasan menu |
| `THANKS_REPLY` | `Alhamdulillah kk...` | Teks balasan terima kasih |
| `QRIS_IMAGE_CAPTION` | `Scan QRIS ini...` | Caption gambar QRIS |

### Rate Limiting

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `RATE_LIMIT_ENABLED` | `true` | Aktifkan rate limiting |
| `RATE_MIN_MS` | `2500` | Delay minimum (ms) |
| `RATE_MAX_MS` | `7000` | Delay maksimum (ms) |

---

## 👑 Command Owner

Command khusus yang hanya bisa digunakan oleh owner.

### saveqris
Simpan template QRIS dari katalog WhatsApp.

**Cara pakai:**
1. Buka chat dengan bot
2. Reply pesan katalog QRIS (yang bisa diklik)
3. Ketik: `saveqris`

---

### exclude
Exclude nomor agar tidak dibalas bot.

**Cara pakai:**
1. Reply pesan dari nomor yang mau di-exclude
2. Ketik: `exclude`

---

### unexclude
Batalkan exclude nomor.

**Cara pakai:**
1. Reply pesan dari nomor yang mau di-unexclude
2. Ketik: `unexclude`

---

### listexclude
Lihat daftar semua nomor yang di-exclude.

**Cara pakai:**
Ketik: `listexclude`

---

## 💬 Trigger Auto Reply

### Menu / Katalog
Trigger: `menu` (atau sesuai `CATALOG_TRIGGERS` di .env)

```
User: menu
Bot: [Teks katalog dari CATALOG_TEXT]
```

### QRIS
Trigger: `qris` (atau sesuai `QRIS_TRIGGERS` di .env)

```
User: qris
Bot: [Template QRIS atau gambar qris.png]
```

### Produk
Trigger: Nama produk yang terdaftar di `PRODUCT_KEYS`

```
User: netflix
Bot: [Info produk Netflix]
```

### Terima Kasih
Trigger: `terimakasih`, `makasih`, `thanks`, dll

```
User: makasih kak
Bot: Alhamdulillah kk, dengan senang hati :)
```

---

## 📁 File Penting

| File | Fungsi |
|------|--------|
| `cooldown.json` | Data cooldown per user |
| `runtime_exclude.json` | Daftar nomor yang di-exclude |
| `qris_catalog_saved.json` | Template QRIS tersimpan |
| `qris.png` | Gambar QRIS fallback |
| `auth_info_baileys/` | Data autentikasi WhatsApp |

---

## 📊 Debug & Monitoring

### Format Log
```
HH:MM:SS  NOMOR           "PESAN"               ICON STATUS
17:30:00  6281234567890    "menu"                ✓ catalog terkirim
```

### Icon Status
| Icon | Arti |
|------|------|
| ✓ | Pesan terkirim |
| ⏸ | Cooldown aktif |
| 🚫 | Nomor di-exclude |
| — | Tidak dikenali |
| ⚙ | Command owner |

---

## 🔧 Troubleshooting

### Bot tidak merespon
1. Pastikan `PRIVATE_CHAT_ONLY=true` dan pesan bukan dari grup
2. Cek apakah nomor ter-exclude (`listexclude`)
3. Cek apakah cooldown masih aktif (lihat log)

### QR Code tidak muncul
1. Hapus folder `auth_info_baileys/`
2. Jalankan ulang bot
3. Scan QR yang muncul

### QRIS tidak terkirim
1. Pastikan sudah `saveqris` template QRIS
2. Atau letakkan file `qris.png` di folder root

### Session Expired
1. Hapus folder `auth_info_baileys/`
2. Jalankan ulang bot
3. Scan QR baru

---

## 📝 Catatan

- Bot hanya memproses **private chat** (bukan grup)
- Setiap user hanya bisa trigger 1x per 24 jam (per command/produk)
- Data cooldown dan exclude tersimpan otomatis
- Tekan `Ctrl+C` untuk menghentikan bot dengan aman

---

**Made with ❤️ for your WhatsApp Business**
