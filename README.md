# Translator Backend

REST API penerjemah multi-bahasa dengan arsitektur **NestJS + MySQL + RabbitMQ**.
Request translation diterima lewat HTTP, diproses **asynchronous** oleh worker satu
per satu, lalu hasilnya dikirim kembali ke `callback_url` milik client dengan
tanda tangan JWT sehingga bisa diverifikasi.

Dokumen ini adalah referensi lengkap untuk **programmer client** (memakai API
translation + callback) dan **programmer frontend admin** (mengelola master data
dan memantau hasil terjemahan).

Dokumen terkait:

- [DATABASE.md](./DATABASE.md) — skema database, konvensi penyimpanan, index, query referensi.
- [LICENSE](./LICENSE) — lisensi MIT + kondisi "tidak boleh dijual-belikan".

---

## Daftar Isi

1. [Gambaran Sistem](#1-gambaran-sistem)
2. [Kebutuhan Teknis](#2-kebutuhan-teknis)
3. [Instalasi & Menjalankan Aplikasi](#3-instalasi--menjalankan-aplikasi)
4. [Konfigurasi Environment](#4-konfigurasi-environment)
5. [Struktur Project](#5-struktur-project)
6. [Format Response](#6-format-response)
7. [Autentikasi Admin & Client](#7-autentikasi-admin--client)
8. [Autentikasi Translator (Signature Token)](#8-autentikasi-translator-signature-token)
9. [Alur Sistem Translator](#9-alur-sistem-translator)
10. [Referensi API](#10-referensi-api)
11. [Callback ke Client](#11-callback-ke-client)
12. [Rate Limit](#12-rate-limit)
13. [Driver & Engine Penerjemah](#13-driver--engine-penerjemah)
14. [Database: Migration & Seeder](#14-database-migration--seeder)
15. [Deploy dengan Docker](#15-deploy-dengan-docker)
16. [Script Bantu & Testing](#16-script-bantu--testing)
17. [Catatan Perilaku & Troubleshooting](#17-catatan-perilaku--troubleshooting)
18. [Lisensi](#18-lisensi)

---

## 1. Gambaran Sistem

```mermaid
flowchart LR
    C[Client / Frontend Admin] -->|1. POST /translate + key_id + Bearer JWT| API[REST API]
    API -->|2. simpan histories status=requested| DB[(MySQL)]
    API -->|3. publish translate| MQ[[RabbitMQ]]
    API -->|4. 200 OK + history_id| C
    MQ -->|5. consume satu per satu| W1[Translate Worker]
    W1 -->|6. panggil driver engine| P[Gemini / Claude / DeepSeek / Google Translate]
    W1 -->|7. update translated_content| DB
    W1 -->|8. publish callback| MQ
    MQ -->|9. consume| W2[Callback Worker]
    W2 -->|10. POST callback_url + key_id + Bearer JWT| C
```

- **API** hanya memvalidasi request, menyimpan job, lalu melempar perintah ke
  RabbitMQ. Client langsung menerima `200 OK` (tidak menunggu terjemahan selesai).
- **Worker** memproses task `translate` satu per satu (`prefetch = 1`), memanggil
  driver yang dipilih, menyimpan hasil, lalu mengirim perintah `callback`.
- Jika pengiriman callback gagal 1x, sistem menjadwalkan ulang lewat RabbitMQ
  (default 5 menit). Gagal 2x → diabaikan dan status callback ditutup.

Fitur yang sudah tertanam:

| Fitur                       | Keterangan                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Multi driver                | Gemini, Claude, DeepSeek, Google Translate — cukup daftarkan `drivers.id` dengan prefix yang sesuai |
| Secret terenkripsi          | `drivers.secret_key` dan `account_keys.secret_key` disimpan terenkripsi AES-256-GCM                 |
| Worker idempotent           | Pesan duplikat tidak menimpa hasil terjemahan yang sudah selesai                                    |
| Quota per akun & per driver | `max_rpm` (per menit) dan `max_rpd` (per hari)                                                      |
| Retry otomatis              | Driver sedang limit atau provider error sementara → job dijadwalkan ulang, bukan langsung gagal     |
| Audit lengkap               | Semua job tercatat di `histories` beserta status, jumlah retry, dan waktu callback                  |

---

## 2. Kebutuhan Teknis

| Komponen | Versi                | Catatan                                                   |
| -------- | -------------------- | --------------------------------------------------------- |
| Node.js  | ≥ 20 (disarankan 22) | memakai `fetch` bawaan                                    |
| MySQL    | 8.x                  | database `mdi_translator`                                 |
| RabbitMQ | 3.11+                | management plugin opsional tapi berguna                   |
| Docker   | opsional             | untuk deploy, lihat [bagian 15](#15-deploy-dengan-docker) |

Dependency utama: `@nestjs/{common,core,config,jwt,typeorm}`, `typeorm`, `mysql2`,
`amqplib`, `bcryptjs`, `class-validator`, `class-transformer`, `cookie-parser`.

---

## 3. Instalasi & Menjalankan Aplikasi

```bash
# 1. Install dependency
npm install

# 2. Siapkan environment
copy .env.example .env        # Linux/macOS: cp .env.example .env
#    lalu sesuaikan DB_*, JWT_SECRET, APP_ENCRYPTION_KEY, RABBITMQ_URL

# 3. Buat database (bila belum ada), jalankan migration, isi data awal
npm run db:create
npm run migration:run
npm run seed

# 4. Jalankan API + worker
npm run start:dev
```

Perintah lain yang sering dipakai:

| Perintah                                | Fungsi                                           |
| --------------------------------------- | ------------------------------------------------ |
| `npm run start:dev`                     | API + worker (watch mode)                        |
| `npm run start:worker`                  | hanya worker (tanpa HTTP)                        |
| `npm run build` && `npm run start:prod` | jalankan hasil build (`dist/main.js`)            |
| `npm run start:prod:worker`             | worker dari hasil build (`dist/worker.js`)       |
| `npm run lint` / `npm run format`       | ESLint (auto-fix) / Prettier                     |
| `npm test` / `npm run test:e2e`         | unit test / end-to-end test                      |
| `npm run token:sign -- ...`             | generate Bearer token untuk testing `/translate` |
| `npm run callback:listen`               | server contoh penerima callback (port 4000)      |

Setelah aplikasi hidup, cek `GET http://localhost:3000/health`:

```json
{
  "success": true,
  "message": "Health check completed",
  "data": {
    "status": "ok",
    "app": "translator-backend",
    "environment": "development",
    "timezone": "Asia/Jakarta",
    "version": "0.0.1",
    "uptime": 42,
    "timestamp": "2026-09-30T02:27:51.000Z",
    "dependencies": { "database": "up", "broker": "up" }
  }
}
```

### Akun hasil seeder

| Role   | Email                         | Password    |
| ------ | ----------------------------- | ----------- |
| admin  | `halo.trisnasejati@gmail.com` | `admin123`  |
| client | `devs.trisnasejati@gmail.com` | `client123` |

> Seeder juga membuat **1 API key per akun** dan menampilkan `key_id` +
> `secret_key` di console (`npm run seed`). `secret_key` hanya ditampilkan sekali —
> simpan di tempat aman.

---

## 4. Konfigurasi Environment

Seluruh konfigurasi berada di `.env` (template lengkap: `.env.example`,
konfigurasi container: `.env.docker`).

### Aplikasi

| Variable        | Default                 | Keterangan                                                                       |
| --------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`      | `development`           | `production` mengaktifkan validasi ketat (secret wajib diubah) & cookie `secure` |
| `APP_VERSION`   | `1.0.0`                 | versi yang dilaporkan `GET /` dan `GET /health`                                  |
| `APP_PORT`      | `3000`                  | port HTTP                                                                        |
| `APP_URL`       | `http://localhost:3000` | dipakai untuk logging & info aplikasi                                            |
| `APP_TIMEZONE`  | `Asia/Jakarta`          | label timezone pada response                                                     |
| `ENABLE_HTTP`   | `true`                  | `false` → proses ini hanya menjalankan worker                                    |
| `ENABLE_WORKER` | `true`                  | `false` → proses ini hanya melayani HTTP (tidak consume queue)                   |
| `CORS_ORIGINS`  | `*`                     | daftar origin dipisah koma, `*` = semua                                          |
| `BODY_LIMIT`    | `1mb`                   | batas ukuran request body                                                        |

### Database

| Variable                      | Default              | Keterangan                                       |
| ----------------------------- | -------------------- | ------------------------------------------------ |
| `DB_HOST` / `DB_PORT`         | `localhost` / `3306` | host & port MySQL                                |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / _(kosong)_  | kredensial MySQL                                 |
| `DB_DATABASE`                 | `mdi_translator`     | nama database                                    |
| `DB_SYNCHRONIZE`              | `false`              | **jangan diaktifkan**, schema dikelola migration |
| `DB_LOGGING`                  | `false`              | `true` untuk mencetak semua query                |
| `DB_CONNECTION_LIMIT`         | `10`                 | ukuran connection pool                           |

### Keamanan

| Variable              | Default        | Keterangan                                           |
| --------------------- | -------------- | ---------------------------------------------------- |
| `JWT_SECRET`          | –              | penanda tangan access token admin/client             |
| `JWT_EXPIRES_IN`      | `86400`        | umur access token (detik)                            |
| `JWT_COOKIE_NAME`     | `access_token` | nama cookie token                                    |
| `SIGNATURE_TOKEN_TTL` | `300`          | umur signature token `/translate` & callback (detik) |
| `APP_ENCRYPTION_KEY`  | –              | kunci enkripsi secret di database                    |
| `BCRYPT_ROUNDS`       | `10`           | cost bcrypt untuk hash password                      |

> `APP_ENCRYPTION_KEY` **wajib sama** di semua instance (API & worker). Mengubahnya
> membuat secret yang tersimpan tidak dapat didekripsi lagi.

### RabbitMQ & Retry

| Variable                   | Default                             | Keterangan                                            |
| -------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `RABBITMQ_ENABLED`         | `true`                              | `false` → `/translate` menolak request (503)          |
| `RABBITMQ_URL`             | `amqp://guest:guest@localhost:5672` | koneksi broker                                        |
| `RABBITMQ_EXCHANGE`        | `translator`                        | nama exchange (direct)                                |
| `RABBITMQ_PREFETCH`        | `1`                                 | jumlah task yang diambil worker sekaligus             |
| `RABBITMQ_RECONNECT_MS`    | `5000`                              | jeda reconnect otomatis                               |
| `TRANSLATE_RETRY_DELAY_MS` | `60000`                             | jeda requeue saat driver limit / provider error       |
| `TRANSLATE_MAX_RETRY`      | `5`                                 | jumlah maksimal requeue sebelum job ditandai `failed` |
| `CALLBACK_RETRY_DELAY_MS`  | `300000`                            | jeda pengiriman ulang callback (5 menit)              |
| `CALLBACK_MAX_ATTEMPTS`    | `2`                                 | jumlah percobaan callback sebelum diabaikan           |
| `CALLBACK_TIMEOUT_MS`      | `15000`                             | timeout HTTP saat mengirim callback                   |

### Terjemahan

| Variable                                                                                | Default                                              | Keterangan                           |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `TRANSLATION_MAX_CHARS`                                                                 | `5000`                                               | panjang maksimal `reference_content` |
| `TRANSLATION_TIMEOUT_MS`                                                                | `60000`                                              | timeout request ke provider          |
| `TRANSLATION_PROMPT_EXTRA`                                                              | _(kosong)_                                           | instruksi tambahan untuk engine AI   |
| `GEMINI_BASE_URL` / `GEMINI_MODEL`                                                      | `…/v1beta` / `gemini-2.5-flash`                      | endpoint & model Gemini              |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` / `ANTHROPIC_VERSION` / `ANTHROPIC_MAX_TOKENS` | `…/v1` / `claude-sonnet-4-5` / `2023-06-01` / `8192` | konfigurasi Claude                   |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`                                                  | `…/v1` / `deepseek-chat`                             | konfigurasi DeepSeek                 |
| `GOOGLE_TRANSLATE_BASE_URL` / `GOOGLE_TRANSLATE_FORMAT`                                 | `…/language/translate/v2` / `text`                   | konfigurasi Google Cloud Translation |

---

## 5. Struktur Project

```
src/
├── main.ts                     # bootstrap HTTP
├── worker.ts                   # bootstrap worker (tanpa HTTP)
├── bootstrap.ts                # cookie parser, CORS, shutdown hooks
├── app.module.ts               # root module + global guard/pipe/filter/interceptor
├── common/                     # enums, decorators, DTO umum, filter, interceptor, utils
│   ├── constants/              # konstanta aplikasi & topologi queue
│   ├── decorators/             # @Public, @Roles, @CurrentAccount, @TranslateContext, @ResponseMessage
│   ├── dto/                    # pagination, param UUID, PaginatedResult
│   ├── filters/                # AllExceptionsFilter (format error seragam)
│   ├── interceptors/           # ResponseInterceptor (envelope sukses)
│   └── utils/                  # uuid v7 + transformer binary(16), JWT HS256, helper object
├── config/                     # configuration.ts (semua env), env.validation.ts
├── database/
│   ├── data-source.ts          # DataSource untuk TypeORM CLI
│   ├── database.module.ts      # koneksi MySQL aplikasi
│   ├── migrations/             # migration schema
│   └── seeds/                  # seeder idempotent
├── scripts/                    # create-database, sign-token, callback-receiver
└── modules/
    ├── auth/                   # login, access-token, JwtAuthGuard, RolesGuard
    ├── tokens/                 # TokensService (access token & signature token)
    ├── security/               # CryptoService (AES-256-GCM), PasswordService (bcrypt)
    ├── languages/              # CRUD bahasa
    ├── drivers/                # CRUD driver + resolusi engine
    ├── accounts/               # CRUD akun
    ├── account-drivers/        # akses driver per akun
    ├── account-keys/           # API key + callback URL
    ├── histories/              # data translasi + resend/retranslate
    ├── translate/              # POST /translate + TranslateSignatureGuard
    ├── rate-limit/             # quota akun & driver
    ├── queue/                  # QueueService (RabbitMQ, retry queue, consumer)
    ├── engines/                # kontrak engine + implementasi Gemini/Claude/DeepSeek/Google
    └── workers/                # TranslateConsumer & CallbackConsumer
```

---

## 6. Format Response

### Sukses

```json
{
  "success": true,
  "message": "Languages retrieved successfully",
  "data": [{ "id": "en", "name": "English", "status": "active" }],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

`meta` hanya muncul pada endpoint list. Endpoint yang tidak mengembalikan data
(mis. `DELETE`) menghasilkan `"data": null`.

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "message": "driver_id is required" },
    { "message": "translate_from must be a language code" }
  ],
  "meta": {
    "path": "/translate",
    "method": "POST",
    "statusCode": 400,
    "timestamp": "2026-09-30T02:29:36.907Z"
  }
}
```

Status code yang dipakai:

| Code      | Arti                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| 200 / 201 | sukses                                                                         |
| 400       | validasi input / data tidak valid / master data tidak aktif                    |
| 401       | token tidak ada, salah, atau kedaluwarsa (termasuk `key_id` & signature token) |
| 403       | akun nonaktif, role tidak sesuai, driver tidak diberikan ke akun               |
| 404       | data tidak ditemukan                                                           |
| 409       | konflik data (duplikat, masih dipakai)                                         |
| 429       | quota `max_rpm` / `max_rpd` terlampaui                                         |
| 503       | broker / provider / driver belum siap                                          |

### Parameter list (query)

| Parameter | Default | Keterangan                                      |
| --------- | ------- | ----------------------------------------------- |
| `page`    | `1`     | halaman (mulai dari 1)                          |
| `limit`   | `10`    | jumlah baris (maks 100)                         |
| `search`  | –       | keyword, kolom yang dicari berbeda per resource |
| `order`   | `desc`  | `asc` atau `desc` berdasarkan waktu pembuatan   |

Endpoint list tertentu menambahkan filter sendiri: `status`, `type`, `role`,
`driver_id`, `translate_from`, `translate_to`, `reference_id`, `date_from`,
`date_to`, `callback_status`, `account_id`.

### Field yang tidak dikenal ditolak

`POST`/`PUT` mengembalikan `400 Validation failed` bila body memuat field di luar
kontrak API (mis. `debug: true`). Ini disengaja agar typo seperti `driverId`
(seharusnya `driver_id`) tidak lolos diam-diam.

---

## 7. Autentikasi Admin & Client

Semua endpoint **kecuali** `GET /`, `GET /health`, `POST /auth/login`, dan
`POST /translate` membutuhkan access token.

- Header: `Authorization: Bearer <access_token>`
- Cookie: `access_token` (httpOnly, di-set otomatis saat login — cocok untuk frontend admin)

Token adalah JWT yang ditandatangani `JWT_SECRET`, payload:

```json
{
  "sub": "<account_id>",
  "email": "user@example.com",
  "role": "admin",
  "full_name": "Admin",
  "iat": 1780272000,
  "exp": 1780358400
}
```

### Login

`POST /auth/login`

```json
{ "email": "devs.trisnasejati@gmail.com", "password": "client123" }
```

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token_type": "Bearer",
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 86400,
    "expires_at": "2026-10-01T02:29:36.000Z",
    "account": {
      "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
      "full_name": "Client",
      "email": "devs.trisnasejati@gmail.com",
      "role": "client",
      "status": "active",
      "max_rpm": 0,
      "max_rpd": 0
    }
  }
}
```

Response juga mengeset cookie `access_token` (`httpOnly`, `sameSite=lax`,
`secure` saat production) sehingga frontend browser tidak perlu menyimpan token
di `localStorage`.

### Daftar endpoint autentikasi

| Method | Path            | Akses         | Keterangan                                               |
| ------ | --------------- | ------------- | -------------------------------------------------------- |
| POST   | `/auth/login`   | public        | login, mengembalikan token + set cookie                  |
| GET    | `/access-token` | admin, client | menerbitkan access token baru (refresh) untuk sesi aktif |
| GET    | `/auth/me`      | admin, client | profil akun yang sedang login                            |
| POST   | `/auth/logout`  | admin, client | menghapus cookie `access_token`                          |

### Matriks akses

| Endpoint                                                                          |                   admin                   |              client              |
| --------------------------------------------------------------------------------- | :---------------------------------------: | :------------------------------: |
| `POST /translate`                                                                 |                    ✅                     |                ✅                |
| `GET /languages`                                                                  |                    ✅                     |                ✅                |
| `POST /languages/insert`, `PUT /languages/update/{ID}`                            |                    ✅                     |                –                 |
| `GET /drivers`                                                                    |             ✅ (semua driver)             | ✅ (hanya driver yang diberikan) |
| `POST /drivers/insert`, `PUT /drivers/update/{ID}`, `DELETE /drivers/delete/{ID}` |                    ✅                     |                –                 |
| `GET /accounts`, `/accounts/detail/{ID}`, insert/update/delete                    |                    ✅                     |                –                 |
| `GET /account-drivers`, insert/update/delete                                      |                    ✅                     |                –                 |
| `GET /account-keys`                                                               | ✅ (semua akun, bisa filter `account_id`) |     ✅ (hanya milik sendiri)     |
| `/account-keys` insert/update/delete                                              |       ✅ (boleh menarget akun lain)       |     ✅ (hanya milik sendiri)     |
| `GET /histories`, `/histories/detail/{ID}`                                        |                ✅ (semua)                 |        ✅ (milik sendiri)        |
| `DELETE /histories/delete/{ID}`, `POST /histories/retranslate/{ID}`               |                    ✅                     |                –                 |
| `POST /histories/resend-callback/{ID}`                                            |                    ✅                     |        ✅ (milik sendiri)        |

---

## 8. Autentikasi Translator (Signature Token)

`POST /translate` **dan** pengiriman callback memakai skema kredensial yang sama
sehingga kedua pihak dapat saling memverifikasi dengan aman:

1. Client mengirim header `key_id` berisi `id` dari `account_keys`.
2. Server (atau client, untuk callback) mengambil `secret_key` milik key tersebut.
3. Ditambahkan header `Authorization: Bearer <JWT>` yang **ditandatangani dengan
   `secret_key`** (HMAC-SHA256), payload:

```json
{
  "account_id": "<UUID akun pemilik key>",
  "reference_id": "<reference_id yang sama dengan body request>",
  "iat": 1780272000,
  "exp": 1780272300
}
```

4. Penerima memverifikasi: `key_id` ada → ambil `secret_key` → verifikasi token →
   samakan `account_id` dengan pemilik key dan `reference_id` dengan body.

Konsekuensinya token hanya berlaku untuk satu `reference_id` tertentu (tidak bisa
di-replay untuk payload lain) dan server tidak perlu menyimpan session.

### Contoh membuat token (JavaScript / Node)

```ts
import { createHmac } from 'crypto';

function signSignatureToken(
  secretKey: string,
  accountId: string,
  referenceId: string,
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    account_id: accountId,
    reference_id: referenceId,
    iat: issuedAt,
    exp: issuedAt + 300,
  });
  const signature = createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}
```

Library JWT standar (`jsonwebtoken`, `firebase/php-jwt`, `PyJWT`, …) juga dapat
dipakai dengan `algorithm: HS256` dan payload di atas.

### Contoh memanggil `POST /translate` (PowerShell)

```powershell
$keyId = '<KEY_ID>'
$accountId = '<ACCOUNT_ID>'
$secretKey = 'sk_translator_...'
$referenceId = 'INV-2026-0001'

$token = (npm run --silent token:sign -- $keyId $accountId $referenceId $secretKey) -replace '^Bearer token : '

$body = @{
  driver_id         = 'gemini-3.8-flash'
  translate_from    = 'id'
  translate_to      = 'en'
  reference_id      = $referenceId
  reference_content = 'Selamat pagi, apa kabar?'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/translate `
  -Headers @{ key_id = $keyId; Authorization = "Bearer $token" } `
  -ContentType 'application/json' -Body $body
```

---

## 9. Alur Sistem Translator

### 9.1 Menerima request

1. Client/Admin memanggil `POST /translate` (header `key_id` + Bearer JWT).
2. Server memvalidasi signature, bahasa, akses driver, quota akun, dan panjang konten.
3. Job disimpan ke `histories` dengan `status = requested`.
4. Perintah `translate` dikirim ke RabbitMQ.
5. Server membalas `200 OK` beserta `history_id`.

> Bila broker sedang tidak bisa dihubungi, job ditandai `failed` dan API membalas
> `503` — supaya tidak ada job "menggantung" tanpa antrian.

### 9.2 Melakukan translate (worker)

1. Worker menerima perintah `translate` satu per satu (`prefetch = 1`).
2. Cek driver: harus `active` dan punya `secret_key`.
3. Cek quota driver (`max_rpm`, `max_rpd`):
   - terlampaui → job dijadwalkan ulang lewat `translator.translate.retry`
     (default 60 detik, maksimal `TRANSLATE_MAX_RETRY` kali), setelah itu `failed`.
4. Konten dikirim ke engine sesuai `driver_id` (lihat [bagian 13](#13-driver--engine-penerjemah)).
5. Hasil disimpan ke `histories.translated_content` dengan `status = translated` dan
   `translated_at = now`; bila gagal permanen → `status = failed`.
6. Perintah `callback` dikirim ke RabbitMQ (juga untuk job `failed`, agar client
   tahu kegagalannya).

> Jika `translate_from` sama dengan `translate_to`, konten dianggap sudah benar:
> job langsung `translated` tanpa memanggil provider (menghemat quota).

### 9.3 Mengirim callback (worker)

1. Worker menerima perintah `callback`.
2. Job yang belum final (`requested`) atau sudah terkirim (`callback_status = close`)
   dilewati — aman terhadap pesan duplikat.
3. Payload dikirim ke `callback_url` milik key dengan header `key_id` + Bearer JWT,
   timeout `CALLBACK_TIMEOUT_MS`.
4. Sukses → `callback_status = close`, `callback_at = now`, `callback_retry = n`.
5. Gagal ke-1 → dijadwalkan ulang ke `translator.callback.retry`
   (`CALLBACK_RETRY_DELAY_MS`, default 5 menit).
6. Gagal ke-2 → diabaikan, `callback_status = close`. Admin/client dapat mengirim
   ulang manual lewat `POST /histories/resend-callback/{ID}`.

Topologi queue yang dibuat otomatis:

```
exchange: translator (direct, durable)

translator.translate          <- routing key: translate
translator.translate.retry    <- routing key: translate.retry  (DLX -> translate)
translator.callback           <- routing key: callback
translator.callback.retry     <- routing key: callback.retry   (DLX -> callback)
```

Delay retry dikirim **per pesan** (`expiration`), sehingga mengubah nilai
`*_RETRY_DELAY_MS` di `.env` tidak memerlukan penghapusan queue di broker.

---

## 10. Referensi API

Semua contoh menganggap `baseUrl = http://localhost:3000`. `{ID}` pada bahasa =
kode 2 huruf (`en`, `id`); pada resource lain = UUIDv7 bentuk teks
(mis. `01a0eea2-2296-71ae-bd0b-9bee0cd7106f`).

### 10.1 Terjemahan

#### `POST /translate` — admin, client

| Field               | Tipe        | Wajib | Keterangan                                               |
| ------------------- | ----------- | ----- | -------------------------------------------------------- |
| `driver_id`         | string(20)  | ✅    | id driver, mis. `gemini-3.8-flash`                       |
| `translate_from`    | string(2)   | ✅    | kode bahasa sumber                                       |
| `translate_to`      | string(2)   | ✅    | kode bahasa tujuan                                       |
| `reference_id`      | string(100) | ✅    | id milik client, dikembalikan pada callback              |
| `reference_content` | string      | ✅    | konten yang diterjemahkan (maks `TRANSLATION_MAX_CHARS`) |

```json
{
  "success": true,
  "message": "Translation request accepted",
  "data": {
    "history_id": "01a0eea4-dc8a-7a15-b4e1-7ad72ade53d4",
    "reference_id": "REF-001",
    "driver_id": "gemini-3.8-flash",
    "translate_from": "id",
    "translate_to": "en",
    "status": "requested",
    "requested_at": "2026-09-29T19:29:36.907Z",
    "callback_enabled": true
  }
}
```

`callback_enabled` bernilai `false` bila `account_keys.callback_url` kosong — pada
kasus itu ambil hasilnya dengan polling `GET /histories/detail/{ID}`.

---

### 10.2 Bahasa (`languages`)

#### `GET /languages` — admin, client

Query: `page`, `limit`, `search` (id/nama), `order`, `status`. Contoh satu baris `data`:

```json
{ "id": "en", "name": "English", "status": "active" }
```

#### `POST /languages/insert` — admin

| Field    | Tipe                   | Wajib | Keterangan                      |
| -------- | ---------------------- | ----- | ------------------------------- |
| `id`     | string(2)              | ✅    | kode bahasa, otomatis lowercase |
| `name`   | string(100)            | ✅    | nama bahasa                     |
| `status` | `active` \| `inactive` | –     | default `active`                |

#### `PUT /languages/update/{ID}` — admin

Body: `name` dan/atau `status`. `id` tidak dapat diubah.

---

### 10.3 Driver (`drivers`)

#### `GET /drivers` — admin, client

Query: `page`, `limit`, `search` (id/nama), `order`, `status`, `type`.
Admin melihat semua driver, client hanya driver yang diberikan kepadanya.

```json
{
  "id": "gemini-3.8-flash",
  "type": "ai",
  "name": "Gemini Flash",
  "status": "active",
  "max_rpm": 10,
  "max_rpd": 250,
  "has_secret_key": true,
  "engine": "gemini"
}
```

`secret_key` **tidak pernah** dikembalikan. `engine` adalah implementasi yang akan
mengeksekusi driver tersebut (`null` bila prefix id tidak dikenal) dan
`has_secret_key` menandakan kredensial sudah diisi.

#### `POST /drivers/insert` — admin

| Field        | Tipe                   | Wajib | Keterangan                                |
| ------------ | ---------------------- | ----- | ----------------------------------------- |
| `id`         | string(3-20)           | ✅    | harus diawali prefix engine yang dikenal  |
| `type`       | `ai` \| `api`          | ✅    | jenis driver                              |
| `name`       | string(100)            | ✅    | nama tampilan                             |
| `status`     | `active` \| `inactive` | –     | default `active`                          |
| `secret_key` | string                 | –     | kredensial provider, disimpan terenkripsi |
| `max_rpm`    | int ≥ 0                | –     | batas task per menit (`0` = tanpa batas)  |
| `max_rpd`    | int ≥ 0                | –     | batas task per hari (`0` = tanpa batas)   |

#### `PUT /drivers/update/{ID}` — admin

Body sama dengan insert (semua opsional, `id` tidak bisa diubah). Kirim
`secret_key` baru untuk menggantinya, atau string kosong untuk menghapusnya.

#### `DELETE /drivers/delete/{ID}` — admin

Menghapus driver beserta akses `account_drivers` terkait. Jika driver sudah dipakai
pada `histories`, permintaan ditolak (`409`) — nonaktifkan saja
(`status: inactive`) agar riwayat tetap utuh.

---

### 10.4 Akun (`accounts`) — admin

#### `GET /accounts`

Query: `page`, `limit`, `search` (nama/email), `order`, `status`, `role`.

#### `GET /accounts/detail/{ID}`

```json
{
  "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
  "full_name": "Client",
  "email": "devs.trisnasejati@gmail.com",
  "role": "client",
  "status": "active",
  "max_rpm": 0,
  "max_rpd": 0,
  "created_at": "2026-09-29T19:26:38.000Z",
  "updated_at": "2026-09-29T19:26:38.000Z"
}
```

#### `POST /accounts/insert`

| Field       | Tipe                   | Wajib | Keterangan                                      |
| ----------- | ---------------------- | ----- | ----------------------------------------------- |
| `full_name` | string(100)            | ✅    | nama lengkap                                    |
| `email`     | string(150)            | ✅    | unik, otomatis lowercase                        |
| `password`  | string(6-100)          | ✅    | disimpan sebagai hash bcrypt                    |
| `role`      | `admin` \| `client`    | –     | default `client`                                |
| `status`    | `active` \| `inactive` | –     | default `active`                                |
| `max_rpm`   | int ≥ 0                | –     | batas request API per menit (`0` = tanpa batas) |
| `max_rpd`   | int ≥ 0                | –     | batas request API per hari (`0` = tanpa batas)  |

#### `PUT /accounts/update/{ID}`

Body sama, semua opsional. Kirim `password` baru untuk menggantinya.

#### `DELETE /accounts/delete/{ID}`

Akun beserta key & akses driver-nya dihapus (cascade). Admin tidak dapat menghapus
akunnya sendiri (`409`).

---

### 10.5 Akses Driver per Akun (`account-drivers`) — admin

#### `GET /account-drivers`

Query: `page`, `limit`, `search` (nama/email akun, nama driver), `order`,
`account_id`, `driver_id`.

```json
{
  "id": "01a0eea2-2301-7a4b-9a11-9f2f1a4b8c33",
  "account_id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
  "account": {
    "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
    "full_name": "Client",
    "email": "devs.trisnasejati@gmail.com"
  },
  "driver_id": "gemini-3.8-flash",
  "driver": {
    "id": "gemini-3.8-flash",
    "name": "Gemini Flash",
    "type": "ai",
    "status": "active"
  },
  "created_at": "2026-09-29T19:26:38.000Z"
}
```

#### `POST /account-drivers/insert`

```json
{
  "account_id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
  "driver_id": "gemini-3.8-flash"
}
```

Pasangan akun+driver harus unik (`409` bila duplikat).

#### `PUT /account-drivers/update/{ID}`

Body: `account_id` dan/atau `driver_id`.

#### `DELETE /account-drivers/delete/{ID}`

---

### 10.6 API Key (`account-keys`) — admin, client

Key inilah yang dipakai sebagai `key_id` pada `POST /translate` dan callback.

#### `GET /account-keys`

Query: `page`, `limit`, `search` (email/nama akun, callback URL), `order`,
`account_id` (admin saja).

```json
{
  "id": "01a0eea2-2296-71ae-bd0b-9bee0cd7106f",
  "account_id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
  "account": {
    "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
    "full_name": "Client",
    "email": "devs.trisnasejati@gmail.com"
  },
  "callback_url": "http://localhost:4000/callback",
  "secret_key_masked": "********",
  "has_secret_key": true,
  "created_at": "2026-09-29T19:26:38.000Z"
}
```

#### `GET /account-keys/detail/{ID}`

Data yang sama dengan di atas. Client hanya boleh mengakses key miliknya (`403` bila bukan).

#### `POST /account-keys/insert`

| Field          | Tipe           | Wajib | Keterangan                                                                   |
| -------------- | -------------- | ----- | ---------------------------------------------------------------------------- |
| `account_id`   | UUID           | –     | admin boleh menentukan akun lain; client selalu diarahkan ke akunnya sendiri |
| `secret_key`   | string(16-255) | –     | bila kosong server membuat `sk_translator_<48 hex>`                          |
| `callback_url` | URL(500)       | –     | tujuan callback; boleh dikosongkan (client polling `/histories`)             |

```json
{
  "success": true,
  "message": "Account key created successfully",
  "data": {
    "id": "01a0eea2-2296-71ae-bd0b-9bee0cd7106f",
    "account_id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
    "account": {
      "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
      "full_name": "Client",
      "email": "devs.trisnasejati@gmail.com"
    },
    "callback_url": "http://localhost:4000/callback",
    "secret_key_masked": "********",
    "has_secret_key": true,
    "created_at": "2026-09-30T02:30:00.000Z",
    "secret_key": "sk_translator_157da09b4aafe3a85e868f2a7abeaf86981a81eab1c5bb5f"
  }
}
```

> **`secret_key` hanya dikembalikan satu kali di response insert.** Setelah itu yang
> tampil hanya `secret_key_masked`. Simpan segera (password manager / env client).

#### `PUT /account-keys/update/{ID}`

Body: `secret_key` (opsional, untuk rotasi) dan/atau `callback_url`
(kirim `null` untuk menghapus callback URL).

#### `DELETE /account-keys/delete/{ID}`

---

### 10.7 Riwayat Translasi (`histories`) — admin, client

#### `GET /histories`

Query: `page`, `limit`, `search` (reference_id / isi konten), `order`, `status`,
`callback_status`, `driver_id`, `translate_from`, `translate_to`, `reference_id`,
`date_from`, `date_to` (ISO 8601, memfilter `requested_at`), `account_id` (admin saja).
Client hanya melihat miliknya sendiri.

```json
{
  "id": "01a0eea4-dc8a-7a15-b4e1-7ad72ade53d4",
  "account_id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
  "account": {
    "id": "01a0eea2-221c-70cd-83d0-56e95a65c37b",
    "full_name": "Client",
    "email": "devs.trisnasejati@gmail.com"
  },
  "driver_id": "gemini-3.8-flash",
  "driver": {
    "id": "gemini-3.8-flash",
    "name": "Gemini Flash",
    "type": "ai",
    "status": "active"
  },
  "translate_from": "id",
  "translate_to": "en",
  "reference_id": "REF-001",
  "reference_content": "Selamat pagi, apa kabar? Semoga harimu menyenangkan.",
  "translated_content": "Good morning, how are you? Hope you have a nice day.",
  "status": "translated",
  "requested_at": "2026-09-29T19:29:36.907Z",
  "translated_at": "2026-09-29T19:29:38.000Z",
  "callback_status": "close",
  "callback_retry": 1,
  "callback_at": "2026-09-29T19:29:38.518Z"
}
```

Status job: `requested` (menunggu/diproses), `translated` (sukses), `failed` (gagal).
Status callback: `open` (masih akan dikirim), `close` (sudah terkirim atau diabaikan).

#### `GET /histories/detail/{ID}`

Detail satu job (client hanya boleh mengakses miliknya sendiri).

#### `POST /histories/resend-callback/{ID}` — admin, client

Membuka kembali callback (`callback_status = open`, `callback_retry = 0`) dan
mengirim ulang perintah callback ke RabbitMQ. Berguna setelah callback gagal 2x
atau setelah `callback_url` diperbaiki. Mengembalikan detail history terbaru.

#### `POST /histories/retranslate/{ID}` — admin

Mengulang proses terjemahan: `status = requested`, `translated_at = null`, callback
dibuka kembali, perintah `translate` dikirim ulang (hasil lama tetap tersimpan
sampai hasil baru tersedia).

#### `DELETE /histories/delete/{ID}` — admin

---

### 10.8 Utilitas

| Method | Path      | Akses  | Keterangan                                           |
| ------ | --------- | ------ | ---------------------------------------------------- |
| GET    | `/`       | public | informasi aplikasi (nama, environment, versi, waktu) |
| GET    | `/health` | public | status aplikasi + dependency (`database`, `broker`)  |

---

## 11. Callback ke Client

Setelah job selesai (sukses maupun gagal), server mengirim HTTP POST ke
`callback_url` milik key yang dipakai.

**Headers**

| Header          | Isi                                                        |
| --------------- | ---------------------------------------------------------- |
| `Content-Type`  | `application/json`                                         |
| `key_id`        | id `account_keys` yang dipakai saat request                |
| `Authorization` | `Bearer <JWT HS256, payload { account_id, reference_id }>` |

**Body**

```json
{
  "status": "translated",
  "translate_from": "id",
  "translate_to": "en",
  "reference_id": "REF-001",
  "translated_content": "Good morning, how are you? Hope you have a nice day.",
  "translated_at": "2026-09-29T19:29:38.518Z"
}
```

`status` bernilai `translated` atau `failed`. Saat `failed`, `translated_content`
bernilai `null`.

**Yang harus dilakukan client**

1. Ambil `key_id` dari header, cari `secret_key` yang bersesuaian di sisi client.
2. Verifikasi `Authorization` Bearer dengan `secret_key` tersebut (HS256).
3. Bandingkan `reference_id` di payload token dengan `reference_id` di body.
4. Balas HTTP `2xx` bila sudah diterima. Selain `2xx` (atau timeout
   `CALLBACK_TIMEOUT_MS`) dianggap gagal → dijadwalkan ulang, maksimal
   `CALLBACK_MAX_ATTEMPTS` (2) percobaan.

Contoh server penerima yang sudah memverifikasi signature dengan benar:

```bash
set CALLBACK_SECRET=sk_translator_...      # PowerShell: $env:CALLBACK_SECRET="sk_translator_..."
npm run callback:listen                    # http://localhost:4000/callback
```

---

## 12. Rate Limit

| Sasaran | Field                                  | Dihitung dari                                   | Kapan dicek                                                           |
| ------- | -------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Akun    | `accounts.max_rpm`, `accounts.max_rpd` | jumlah `histories` milik akun                   | saat `POST /translate` (dilanggar → `429`)                            |
| Driver  | `drivers.max_rpm`, `drivers.max_rpd`   | jumlah `histories` yang memakai driver tersebut | sebelum worker memanggil provider (dilanggar → job dijadwalkan ulang) |

- `max_rpm` = jumlah job dalam **60 detik terakhir**.
- `max_rpd` = jumlah job sejak **00:00 UTC** hari ini.
- Nilai `0` berarti **tanpa batas** (default akun hasil seeder).
- Job yang dibuat bersamaan tetap dihitung, jadi burst request besar bisa membuat
  sebagian job menunggu dan baru diproses pada menit berikutnya.
- Saat limit akun terlampaui, API membalas `429` lengkap dengan `errors` yang
  memuat waktu reset (`rpmResetAt`, `rpdResetAt`).

---

## 13. Driver & Engine Penerjemah

Engine yang tersedia dan pemetaan prefix `drivers.id`:

| Prefix `drivers.id`    | Engine                | Tipe  | `secret_key` yang dipakai        | Model/endpoint                              |
| ---------------------- | --------------------- | ----- | -------------------------------- | ------------------------------------------- |
| `gemini-*`             | GeminiEngine          | `ai`  | API key Google AI Studio         | `GEMINI_MODEL` (default `gemini-2.5-flash`) |
| `claude-*`             | ClaudeEngine          | `ai`  | API key Anthropic                | `ANTHROPIC_MODEL`                           |
| `deepseek-*`           | DeepSeekEngine        | `ai`  | API key DeepSeek                 | `DEEPSEEK_MODEL`                            |
| `api-google-translate` | GoogleTranslateEngine | `api` | Google Cloud Translation API key | `GOOGLE_TRANSLATE_BASE_URL`                 |

Id driver hanyalah penanda/prefix; model yang benar-benar dipanggil ditentukan di
`.env`. Contoh: driver `gemini-3.8-flash` akan memanggil model `GEMINI_MODEL`.
Untuk menambah model lain, cukup buat driver baru dengan prefix yang sama
(mis. `gemini-2.5-pro`) dan isi `secret_key`-nya.

### Menambah engine baru

1. Buat service baru yang mengimplementasikan `TranslationEngine`
   (`src/modules/engines/translation-engine.interface.ts`) — cukup menyediakan
   `provider` dan method `translate(context)`.
2. Daftarkan provider di `EnginesModule` dan pada map
   `EngineRegistry` / `DRIVER_ENGINE_PREFIXES`.
3. Tambahkan konfigurasi endpoint/model di `configuration.ts` + `.env.example`.
4. Buat driver lewat `POST /drivers/insert` dengan id berprefix baru.

---

## 14. Database: Migration & Seeder

`DB_SYNCHRONIZE=false` — schema **hanya** diubah lewat migration.

> Rincian lengkap skema (tipe kolom, index, relasi, query referensi, retensi data):
> **[DATABASE.md](./DATABASE.md)**.

| Perintah                                                              | Fungsi                                       |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `npm run db:create`                                                   | membuat database bila belum ada              |
| `npm run migration:run`                                               | menjalankan seluruh migration                |
| `npm run migration:revert`                                            | membatalkan migration terakhir               |
| `npm run migration:show`                                              | daftar status migration                      |
| `npm run migration:generate -- src/database/migrations/NamaMigration` | membuat migration baru dari perubahan entity |
| `npm run seed`                                                        | mengisi data awal (idempotent, aman diulang) |

### Skema tabel

| Tabel             | Isi                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `languages`       | master bahasa: `id` char(2), `name`, `status`                                                                                                                                                                                              |
| `drivers`         | master driver: `id` varchar(20), `type` (`ai`/`api`), `name`, `status`, `secret_key` (terenkripsi), `max_rpm`, `max_rpd`                                                                                                                   |
| `accounts`        | akun: `id` binary(16) UUIDv7, `full_name`, `email` (unik), `password` (bcrypt), `role` (`admin`/`client`), `status`, `max_rpm`, `max_rpd`, `created_at`, `updated_at`                                                                      |
| `account_drivers` | akses driver per akun (unik per akun+driver)                                                                                                                                                                                               |
| `account_keys`    | kredensial API: `id` (= `key_id`), `account_id`, `secret_key` (terenkripsi), `callback_url`                                                                                                                                                |
| `histories`       | job translasi: `id`, `account_id`, `driver_id`, `translate_from`, `translate_to`, `reference_id`, `reference_content`, `translated_content`, `status`, `requested_at`, `translated_at`, `callback_status`, `callback_retry`, `callback_at` |

Semua id berjenis UUID disimpan sebagai `binary(16)` (UUIDv7 → urut secara
kronologis sehingga ramah untuk index). API selalu menampilkan bentuk teksnya.
Semua kolom waktu memakai `datetime(6)` berisi **UTC**, ditulis aplikasi secara
eksplisit (tidak mengandalkan `NOW()` MySQL, lihat [DATABASE.md](./DATABASE.md)).

### Data seeder

- `languages`: `id` (Bahasa Indonesia), `en` (English)
- `drivers`: `gemini-3.8-flash` (active, `max_rpm` 10 / `max_rpd` 250) dan
  `api-google-translate` (inactive). Keduanya **belum punya `secret_key`** — isi
  lewat `PUT /drivers/update/{ID}` (atau buat driver baru) sebelum dipakai, jika
  tidak `POST /translate` akan menolak dengan `503 Driver "..." is not configured yet`.
- `accounts`: admin & client (lihat [bagian 3](#3-instalasi--menjalankan-aplikasi))
- `account_drivers`: kedua driver diberikan ke kedua akun
- `account_keys`: 1 key per akun dengan `callback_url` `http://localhost:4000/callback`
  (nilai `key_id` & `secret_key` hanya dicetak sekali oleh seeder)

---

## 15. Deploy dengan Docker

Aplikasi dan infrastrukturnya sengaja dipisah menjadi **dua file compose**, supaya
di production Anda bebas menentukan MySQL & RabbitMQ mau dipasang di mana:

| File                       | Isi                                                                        | Wajib? |
| -------------------------- | -------------------------------------------------------------------------- | ------ |
| `docker-compose.infra.yml` | MySQL + RabbitMQ (volume `mysql-data` & `rabbitmq-data`)                   | tidak  |
| `docker-compose.yml`       | API + worker, plus `migrate`/`seeder` (profile `tools`, dijalankan manual) | ya     |

Kedua file memakai project & network yang sama (`translator-net`), jadi container
API/worker tetap bisa mencapai MySQL/RabbitMQ lewat nama service `mysql` dan
`rabbitmq` di `.env.docker`. Kalau layanannya **tidak** dijalankan via Docker,
hapus saja ketergantungan itu dengan mengubah `DB_HOST` / `RABBITMQ_URL`.

### Skenario A — MySQL & RabbitMQ di Docker

```bash
# 1. Sesuaikan kredensial di .env.docker (JWT_SECRET, APP_ENCRYPTION_KEY, password DB/RabbitMQ)
#    DB_HOST=mysql, RABBITMQ_URL=amqp://translator:translator_pass@rabbitmq:5672

# 2. Jalankan MySQL + RabbitMQ, tunggu sampai keduanya healthy
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.infra.yml ps

# 3. Build & jalankan API + worker
docker compose up -d --build

# 4. Jalankan migration lalu seeder (sekali saja / setiap kali ada migration baru)
docker compose run --rm migrate
docker compose run --rm seeder
```

> Langkah 3 & 4 memakai file aplikasi saja, jadi Compose akan mencetak
> `Found orphan containers ([translator-mysql translator-rabbitmq])` karena kedua
> file berada dalam satu project. Peringatan itu normal, penjelasannya ada di
> bagian catatan production di bawah.

### Skenario B — MySQL & RabbitMQ dipasang di OS server yang sama

Install MySQL & RabbitMQ tanpa Docker, lalu arahkan container ke host:

```env
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USERNAME=translator
DB_PASSWORD=...
RABBITMQ_URL=amqp://translator:...@host.docker.internal:5672
```

```bash
docker compose up -d --build
docker compose run --rm migrate
docker compose run --rm seeder
```

> `host.docker.internal` dipetakan otomatis ke host lewat `extra_hosts` di
> `docker-compose.yml`, jadi tetap jalan di Linux (bukan cuma Docker Desktop).
> Pastikan MySQL listen di `0.0.0.0` (bukan hanya `127.0.0.1`) dan user-nya boleh
> login dari luar (`'translator'@'%'`), begitu juga RabbitMQ (`listeners.tcp.default`).

### Skenario C — MySQL & RabbitMQ di server lain / managed service

`docker-compose.infra.yml` tidak dipakai; cukup isi `.env.docker` dengan host tujuan:

```env
DB_HOST=10.0.0.12            # atau rds.amazonaws.com, dst.
DB_PORT=3306
RABBITMQ_URL=amqp://user:pass@mq.contoh.com:5672
```

```bash
docker compose up -d --build
docker compose run --rm migrate
docker compose run --rm seeder
```

Pastikan port 3306/5672 terbuka dari server aplikasi dan kredensialnya benar.

### Service yang tersedia

| File                       | Service              | Container           | Port host                  | Keterangan                                                |
| -------------------------- | -------------------- | ------------------- | -------------------------- | --------------------------------------------------------- |
| `docker-compose.infra.yml` | `mysql`              | translator-mysql    | 3307 → 3306                | data tersimpan di volume `mysql-data`                     |
| `docker-compose.infra.yml` | `rabbitmq`           | translator-rabbitmq | 5673 → 5672, 15673 → 15672 | management UI `http://localhost:15673`                    |
| `docker-compose.yml`       | `api`                | translator-api      | 3000 → 3000                | `ENABLE_WORKER=false` (hanya melayani HTTP)               |
| `docker-compose.yml`       | `worker`             | _(nama otomatis)_   | –                          | `ENABLE_HTTP=false` (hanya consume queue, bisa di-scale)  |
| `docker-compose.yml`       | `migrate` / `seeder` | –                   | –                          | profile `tools`, dijalankan manual (`docker compose run`) |

```bash
docker compose logs -f api worker                  # memantau log API & worker
docker compose up -d --scale worker=3              # menambah worker saat antrian padat
docker compose down                                # stop API + worker (infra tetap jalan)
docker compose -f docker-compose.infra.yml down    # stop MySQL + RabbitMQ (data tetap ada)
docker compose -f docker-compose.infra.yml down -v # stop + hapus volume (reset data!)
```

Catatan production:

- `NODE_ENV=production` membuat validasi menolak `JWT_SECRET` /
  `APP_ENCRYPTION_KEY` / `DB_PASSWORD` yang masih bernilai contoh.
- API/worker tidak lagi `depends_on` MySQL/RabbitMQ (karena keduanya bisa berada
  di luar compose): saat database belum siap, TypeORM mencoba ulang 30× @5 detik
  lalu container di-restart otomatis sampai berhasil. Jalankan `migrate` setelah
  MySQL benar-benar siap (`docker compose -f docker-compose.infra.yml ps`).
- Jalankan `migrate` sebelum menaikkan versi API/worker.
- Cookie token otomatis memakai flag `secure`, jadi API sebaiknya dilayani via HTTPS.
- Kedua file memakai **project & network yang sama**, jadi menjalankan salah satu
  file saat file lainnya sedang jalan akan memunculkan peringatan
  `Found orphan containers ([translator-mysql translator-rabbitmq])`. Peringatan
  itu normal (container yang jalan tidak dihapus) — **jangan** pakai
  `--remove-orphans`, karena flag itu justru menghapus container stack lain. Untuk
  output yang bersih, sebut kedua file sekaligus:
  `docker compose -f docker-compose.infra.yml -f docker-compose.yml up -d`.
- `docker compose down` hanya menghentikan service dari file yang disebut
  (`docker compose down` = API + worker saja, MySQL/RabbitMQ tetap jalan), dan
  volume `mysql-data` tidak ikut terhapus kecuali memakai `-v`.

---

## 16. Script Bantu & Testing

### `npm run token:sign`

Generate Bearer token untuk `POST /translate` (tanpa perlu menulis kode JWT):

```bash
npm run token:sign -- <key_id> <account_id> <reference_id> <secret_key>
```

### `npm run callback:listen`

Server contoh penerima callback di `http://localhost:4000/callback` yang
memverifikasi signature persis seperti yang harus dilakukan client:

```bash
$env:CALLBACK_SECRET="sk_translator_..."   # PowerShell
CALLBACK_SECRET=sk_translator_... npm run callback:listen
```

Contoh log:

```
[CallbackReceiver] POST /callback key_id=01a0eea2-2296-71ae-bd0b-9bee0cd7106f
[CallbackReceiver] Body: {"status":"translated","translate_from":"id",...}
[CallbackReceiver] Signature verified ✔
```

### Test otomatis

```bash
npm test          # unit test
npm run test:e2e  # HTTP end-to-end (butuh MySQL sesuai .env; broker dimatikan otomatis)
```

E2E test membuat akun sementara di database untuk menguji login, guard role, dan
validasi — akun tersebut dihapus kembali setelah selesai.

---

## 17. Catatan Perilaku & Troubleshooting

**Perilaku penting**

- `POST /translate` selalu membalas `200 OK` (diterima), bukan hasil terjemahan.
  Hasil datang lewat callback atau polling `GET /histories/detail/{ID}`.
- Job `failed` juga dikirim melalui callback (dengan `status: "failed"`) agar client
  dapat menandai kegagalan tanpa polling.
- `translate_from == translate_to` → job langsung selesai tanpa memanggil provider.
- `secret_key` hanya terlihat sekali (saat insert); selain itu hanya
  `secret_key_masked`.
- Nilai `secret_key` yang tersimpan terenkripsi; **`APP_ENCRYPTION_KEY` harus sama**
  di API dan worker dan tidak boleh diubah sembarangan.
- Worker bersifat idempotent: pesan duplikat untuk job yang sudah selesai dilewati
  (kecuali diminta lewat `retranslate`).
- `callback_status = close` berarti callback sudah terkirim **atau** sudah
  diabaikan karena melebihi batas percobaan.

**Troubleshooting**

| Gejala                                                  | Penyebab umum                                                                                                                         | Solusi                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `503 Message broker is unavailable`                     | RabbitMQ mati / kredensial `RABBITMQ_URL` salah                                                                                       | perbaiki `.env`, cek `GET /health` → `dependencies.broker`                           |
| `429 Request quota exceeded`                            | `accounts.max_rpm`/`max_rpd` terlampaui                                                                                               | tunggu window berikutnya atau naikkan quota akun                                     |
| Job tetap `requested` lama                              | driver sedang limit, provider error, atau `ENABLE_WORKER=false`                                                                       | cek log worker; job akan diproses ulang atau ditandai `failed`                       |
| Callback tidak sampai                                   | `callback_url` kosong/salah, endpoint client tidak membalas 2xx                                                                       | lihat `callback_retry` lalu putar ulang lewat `POST /histories/resend-callback/{ID}` |
| `403 Your account does not have access to driver "..."` | relasi `account_drivers` belum ada                                                                                                    | tambahkan lewat `POST /account-drivers/insert`                                       |
| `401 Signature token is invalid or expired`             | token ditandatangani dengan `secret_key` berbeda, `reference_id` tidak sama dengan body, atau token sudah lewat `SIGNATURE_TOKEN_TTL` | pastikan payload `{account_id, reference_id}` dan key yang benar                     |
| Log `406 (PRECONDITION-FAILED) ... inequivalent arg`    | di broker sudah ada queue dengan argumen berbeda (biasanya dari versi lama)                                                           | hapus queue tersebut dari management UI / reset vhost lalu restart                   |
| `Invalid environment configuration ...`                 | `NODE_ENV=production` dengan secret contoh                                                                                            | ubah `JWT_SECRET` / `APP_ENCRYPTION_KEY` / `DB_PASSWORD`                             |
| Migration gagal karena tabel sudah ada                  | database pernah dibuat dengan `synchronize` atau dari sumber lain                                                                     | `npm run migration:revert` atau `DROP DATABASE` lalu ulangi                          |

---

## 18. Lisensi

Proyek ini memakai **MIT License + satu kondisi tambahan**: kode boleh dipakai,
dimodifikasi, dan dipublikasikan secara bebas (termasuk untuk keperluan komersial
dan internal perusahaan), tetapi **tidak boleh dijual-belikan** sebagai produk.
Menjual jasa/layanan turunan (implementasi, integrasi, kustomisasi, konsultasi,
hosting, support) tetap **diperbolehkan**.

Silakan baca teks lengkapnya di [LICENSE](./LICENSE) (termasuk ringkasan bahasa
Indonesia yang tidak mengikat). Ringkasnya:

|                                                                                                 | Boleh | Tidak boleh |
| ----------------------------------------------------------------------------------------------- | ----- | ----------- |
| Pakai (pribadi, internal, komersial)                                                            | ✅    |             |
| Ubah / modifikasi                                                                               | ✅    |             |
| Publikasikan / fork (dengan LICENSE utuh)                                                       | ✅    |             |
| Jual jasa turunan: implementasi, integrasi, kustomisasi, konsultasi, training, hosting, support | ✅    |             |
| Jalankan layanan translasi berbayar untuk pelanggan Anda                                        | ✅    |             |
| Jual-belikan software ini (source code, lisensi/akses, bundle produk/template, reseller)        |       | ❌          |
| Tawarkan aplikasi ini "apa adanya" sebagai layanan hosting tanpa nilai tambah                   |       | ❌          |
| Hapus/ubah nota hak cipta dan file `LICENSE`                                                    |       | ❌          |

> Karena ada kondisi tambahan tersebut, lisensi ini **bukan** open source menurut
> definisi OSI/FSF, melainkan _source-available_. Untuk menjadikannya MIT murni,
> hapus Part 2 pada file `LICENSE`.

Hak cipta © 2026 Trisnawan. Dokumen lisensi bukan nasihat hukum; untuk kebutuhan
komersial yang kompleks, konsultasikan dengan penasihat hukum Anda.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.
