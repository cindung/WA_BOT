# 🚀 Panduan Deploy Bot ke VPS (Untuk Pemula)

Panduan ini menjelaskan cara upload dan menjalankan WhatsApp Bot di VPS dari nol.

---

## 📋 Apa yang Dibutuhkan

1. **VPS** (Server) - bisa beli di:
   - [DigitalOcean](https://digitalocean.com) (~$4-6/bulan)
   - [Vultr](https://vultr.com) (~$5/bulan)
   - [Contabo](https://contabo.com) (lebih murah, ~€4/bulan)
   - Provider lokal Indonesia: IDCloudHost, Dewaweb, dll

2. **Akun GitHub** - sudah ada (cindung/WA_BOT)

3. **Software di PC kamu**:
   - Terminal/Command Prompt (sudah ada di Windows)

---

## 🔢 STEP 1: Beli dan Siapkan VPS

### 1.1 Beli VPS
Pilih spesifikasi minimum:
- **OS**: Ubuntu 22.04 atau 24.04
- **RAM**: 1 GB (cukup untuk bot)
- **Storage**: 25 GB

### 1.2 Catat Informasi VPS
Setelah membeli, kamu akan dapat:
```
IP Address: 123.456.789.10 (contoh)
Username: root
Password: password-kamu
```

---

## 🔢 STEP 2: Masuk ke VPS (SSH)

### 2.1 Buka Command Prompt di Windows
Tekan `Win + R`, ketik `cmd`, tekan Enter

### 2.2 Ketik Perintah SSH
```
ssh root@123.456.789.10
```
(Ganti `123.456.789.10` dengan IP VPS kamu)

### 2.3 Ketik Password
- Ketik password VPS kamu
- **Catatan**: Password tidak akan terlihat saat diketik (ini normal!)
- Tekan Enter

### 2.4 Berhasil Masuk
Jika berhasil, kamu akan lihat sesuatu seperti:
```
root@vps-kamu:~#
```

---

## 🔢 STEP 3: Install Node.js di VPS

Ketik perintah ini satu per satu:

### 3.1 Update sistem
```bash
apt update && apt upgrade -y
```
(Tunggu sampai selesai)

### 3.2 Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### 3.3 Cek instalasi berhasil
```bash
node --version
npm --version
```
Harus muncul angka versi seperti: `v20.x.x`

---

## 🔢 STEP 4: Download Bot dari GitHub

### 4.1 Masuk ke folder home
```bash
cd ~
```

### 4.2 Clone repository
```bash
git clone https://github.com/cindung/WA_BOT.git
```

### 4.3 Masuk ke folder bot
```bash
cd WA_BOT
```

### 4.4 Install dependencies
```bash
npm install
```
(Tunggu beberapa menit)

---

## 🔢 STEP 5: Buat File .env

### 5.1 Buat file .env
```bash
nano .env
```

### 5.2 Copy-paste isi .env dari PC lokal kamu
Buka file `.env` di PC lokal, copy semua isinya, lalu paste di terminal VPS.

### 5.3 Simpan file
- Tekan `Ctrl + X`
- Tekan `Y` (untuk Yes)
- Tekan `Enter`

---

## 🔢 STEP 6: Upload Session WhatsApp

Ada 2 cara:

### Cara A: Upload dari PC Lokal (Jika sudah pernah scan QR)

**Di PC lokal (Command Prompt baru):**
```
scp -r "d:\Project abal2\WA_Bot\auth_info_baileys" root@123.456.789.10:~/WA_BOT/
```
(Ganti IP dengan IP VPS kamu)

Ketik password VPS saat diminta.

### Cara B: Scan QR di VPS (Jika belum pernah scan)

Langsung ke Step 7 - QR akan muncul di terminal.

---

## 🔢 STEP 7: Jalankan Bot

### 7.1 Jalankan bot
```bash
npm start
```

### 7.2 Jika perlu scan QR
- QR code akan muncul di terminal
- Buka WhatsApp di HP → Perangkat Tertaut → Tautkan Perangkat
- Scan QR yang muncul

### 7.3 Bot berhasil jalan
Akan muncul:
```
✅ Bot WhatsApp terhubung!
```

---

## 🔢 STEP 8: Jalankan Bot di Background (Penting!)

Jika kamu tutup terminal, bot akan mati. Gunakan PM2 agar bot jalan terus:

### 8.1 Install PM2
```bash
npm install -g pm2
```

### 8.2 Jalankan bot dengan PM2
```bash
pm2 start wabot.js --name "wabot"
```

### 8.3 Agar PM2 jalan otomatis saat VPS restart
```bash
pm2 save
pm2 startup
```
Jika muncul perintah tambahan, copy dan jalankan perintah tersebut.

---

## 📋 Perintah PM2 yang Perlu Diingat

| Perintah | Fungsi |
|----------|--------|
| `pm2 logs wabot` | Lihat log bot |
| `pm2 status` | Lihat status bot |
| `pm2 restart wabot` | Restart bot |
| `pm2 stop wabot` | Stop bot |
| `pm2 start wabot` | Jalankan bot |

---

## ❓ Troubleshooting

### Bot tidak bisa konek ke WhatsApp
```bash
pm2 stop wabot
rm -rf auth_info_baileys
pm2 start wabot
```
Lalu scan QR ulang.

### Mau lihat log
```bash
pm2 logs wabot
```
Tekan `Ctrl + C` untuk keluar dari log.

### Mau update bot dari GitHub
```bash
cd ~/WA_BOT
pm2 stop wabot
git pull
npm install
pm2 start wabot
```

---

## 🎉 Selesai!

Bot kamu sekarang berjalan 24/7 di VPS. Kamu bisa tutup terminal dan bot tetap jalan.

**Tips:**
- Cek log sesekali: `pm2 logs wabot`
- Jika ada masalah, restart: `pm2 restart wabot`

---

**Ada pertanyaan? Tanyakan saja!**
