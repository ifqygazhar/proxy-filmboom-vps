# Filmboom VPS Proxy

Backend proxy kecil untuk menjalankan request Filmboom dari VPS/non-Cloudflare. Ini dipakai karena Cloudflare Pages sering kena `429 RESOURCE_EXHAUSTED` saat memanggil upstream langsung.

## Jalankan dengan Bun

```bash
cd filmboom-vps-proxy
bun server.js
```

Atau lewat package script:

```bash
bun run start
```

Env opsional, simpan sebagai `.env` saat deploy ke VPS:

```bash
HOST=0.0.0.0
PORT=8787
ALLOWED_ORIGINS=https://film.meongplod.my.id,http://localhost:5173
PROXY_SHARED_SECRET=isi-secret-acak
FETCH_TIMEOUT_MS=15000
```

Kalau proxy akan ditaruh di belakang Nginx, set `HOST=127.0.0.1`. Kalau mau langsung dibuka lewat port VPS, pakai `HOST=0.0.0.0`.

## Deploy VPS dengan PM2

Ya, proxy ini bisa dijalankan pakai Bun dan dikelola PM2. Script deploy sudah disiapkan:

```bash
cd filmboom-vps-proxy
chmod +x deploy.sh
./deploy.sh
```

Script akan:

- memastikan `bun` tersedia, lalu install jika belum ada
- memastikan `pm2` tersedia, lalu install jika belum ada
- membuat `.env` default jika belum ada
- menjalankan `bun install --production`
- start/reload app via `pm2 start ecosystem.config.cjs --update-env`
- menjalankan `pm2 save`

Contoh deploy dengan env custom:

```bash
PORT=8787 \
HOST=0.0.0.0 \
ALLOWED_ORIGINS=https://film.meongplod.my.id \
PROXY_SHARED_SECRET=isi-secret-acak \
./deploy.sh
```

Command PM2 manual:

```bash
pm2 start ecosystem.config.cjs --update-env
pm2 logs filmboom-vps-proxy
pm2 restart ecosystem.config.cjs --update-env
```

Endpoint:

```text
GET /health
GET /api/film/detail?detailPath=<slug>&season=<season>&episode=<episode>
```

Kalau `PROXY_SHARED_SECRET` diisi, request ke `/api/*` wajib mengirim header:

```text
x-proxy-secret: isi-secret-acak
```

## Integrasi ke app utama

Set env ini di Cloudflare Pages:

```bash
FILMBOOM_PROXY_URL=https://proxy-domain-vps-kamu.com
FILMBOOM_PROXY_SECRET=isi-secret-acak
```

`FILMBOOM_PROXY_SECRET` harus sama dengan `PROXY_SHARED_SECRET` di VPS. Kalau `FILMBOOM_PROXY_URL` kosong, app utama akan tetap memakai logic fetch lama.
