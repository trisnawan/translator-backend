Buat aplikasi backend REST API untuk melakukan translate multi-bahasa dengan format JSON REST API. Buat projek dengan struktur folder yang rapi, best-practice, dan clean-code. Pastikan mudah di maintenance dikemudian hari dan di integrasikan dengan drivers penterjemah AI atau API lainnya.

Simpan kredensial dan environment aplikasi dan tiap driver di file .env. Siapkan juga konfigurasi docker untuk deploy.

# Kebutuhan Teknis

1. RabbitMQ (terima tugas satu persatu, di production bisa di set di .env)
2. JWT Token
3. Database MySQL (database `mdi_translator` [localhost,root,], di production bisa di ubah lewat .env)
4. TypeORM NestJS (dengan migration)

# Design Database (MySQL)

Tabel `languages`, berisi master data bahasa yang didukung:

- id (char 2, berisi kode bahasa [en,id])
- name (varchar 100, berisi nama bahasa)
- status (enum [active,inactive])

Tabel `drivers`, berisi master data driver penerjemah (mendukung Gemini AI, Claude AI, DeepSeek AI, dan Google Cloud Translation API):

- id (varchar 20, berisi nama model atau API [gemini-flash,deepseek-flash,google-translate])
- type (enum, [ai,api])
- name (varchar 100, berisi nama penerjemah)
- status (enum [active,inactive])
- secret_key (enkripsi sebelum simpan ke database)
- max_rpm (int, maksimal tugas per menit)
- max_rpd (int, maksimal tugas per hari)

Tabel `accounts`, berisi master data akun:

- id (UUIDv7, simpan dalam bentuk binary)
- full_name
- email
- password (simpan hash)
- role (enum [admin,client], default client)
- status (enum [active,inactive], default active)
- max_rpm (int, maksimal request per menit)
- max_rpd (int, maksimal request per hari)
- created_at (timestamp)
- updated_at (timestamp)

Tabel `account_drivers`, berisi driver mana saja yang bisa di akses melalui API translator:

- id (UUIDv7, simpan dalam bentuk binary)
- account_id (join ke accounts)
- driver_id (join ke drivers)
- created_at (timestamp)

Tabel `account_keys`, berisi secret key untuk akses API:

- id (UUIDv7, simpan dalam bentuk binary)
- account_id (join ke accounts)
- secret_key (enkripsi, untuk keperluan request dan callback api)
- callback_url
- created_at (timestamp)

Tabel `histories`, berisi data translasi:

- id (UUIDv7, simpan dalam bentuk binary)
- account_id (join ke accounts)
- driver_id (join ke drivers)
- translate_from (kode bahasa)
- translate_to (kode bahasa)
- reference_id (ambil dari request API)
- reference_content (konten bahasa original)
- translated_content (konten yang telah di translate)
- status (enum [requested,translated,failed])
- requested_at (timestamp, waktu API request)
- translated_at (timestamp, waktu selesai di translate)
- callback_status (enum, [open,close])
- callback_retry (int, jumlah pengiriman callback)
- callback_at (timestamp, waktu berhasil kirim callback)

# Database Seeder

Tabel `languages`:

1. Bahasa Indonesia (id)
2. English (en)

Tabel `drivers`:

1. Gemini Flash (gemini-3.8-flash).
2. Google Translate (api-google-translate).

Tabel `accounts`:

1. Admin | halo.trisnasejati@gmail.com | admin123
2. Client | devs.trisnasejati@gmail.com | client123

# Fitur Role Admin

- Mengelola CRUD Bahasa `languages`
- Mengelola CRUD Driver `drivers`
- Mengelola CRUD Accounts `accounts`
- Mengelola CRUD Akses Driver `account_drivers`
- Mengelola CRUD Keys `account_keys` untuk akunnya sendiri
- Akses ke API translating

# Fitur Role Client

- Mengelola CRUD Keys `account_keys` untuk akunnya sendiri
- Akses ke API translating

# Alur Sistem Translator

Menerima Request dari API:

1. Client/Admin Request melalui API
2. Sistem simpan ke database dan kirim perintah `translate` ke RabbitMQ
3. Sistem memberikan response 200 - OK

Melakukan Translate:

1. Sistem menerima perintah `translate` dari RabbitMQ (terima satu per-satu)
2. Sistem tugaskan driver yang dipilih untuk translate konten
3. Sistem update hasil translate ke `histories.translated_content`
4. Sistem kirim perintah `callback` ke RabbitMQ

Mengirimkan Hasil Translate:

1. Sistem menerima perintah `callback` dari RabbitMQ
2. Sistem mengirimkan Callback ke URL yang ditentukan
3. Jika gagal 1x, jadwalkan ulang ke RabbitMQ dalam 5 menit. Jika gagal 2x, abaikan

# API Spec

Menerima request - POST `/translate` (admin,client):

```json
{
  "driver_id": "[ID DRIVER]",
  "translate_from": "[ID LANGUAGE]",
  "translate_to": "[ID LANGUAGE]",
  "reference_id": "[ID DARI CLIENT]",
  "reference_content": "[KONTEN]"
}
```

Mengirim hasil - POST `{callback_url}`:

```json
{
  "status": "[STATUS]",
  "translate_from": "[ID LANGUAGE]",
  "translate_to": "[ID LANGUAGE]",
  "reference_id": "[ID DARI CLIENT]",
  "translated_content": "[KONTEN]",
  "translated_at": "[KONTEN]"
}
```

CRUD Languages (admin):

- GET `/languages`
- POST `/languages/insert`
- PUT `/languages/update/{ID}`

CRUD Drivers (admin):

- GET `/drivers`
- POST `/drivers/insert`
- PUT `/drivers/update/{ID}`
- DELETE `/drivers/delete/{ID}`

CRUD Accounts (admin):

- GET `/accounts`
- GET `/accounts/detail/{ID}`
- POST `/accounts/insert`
- PUT `/accounts/update/{ID}`
- DELETE `/accounts/delete/{ID}`

CRUD Account Drivers (admin):

- GET `/account-drivers`
- POST `/account-drivers/insert`
- PUT `/account-drivers/update/{ID}`
- DELETE `/account-drivers/delete/{ID}`

CRUD Account Keys (admin,client):

- GET `/account-keys`
- GET `/account-keys/detail/{ID}`
- POST `/account-keys/insert`
- PUT `/account-keys/update/{ID}`
- DELETE `/account-keys/delete/{ID}`

Data Histories:

- GET `/histories` (admin,client)
- GET `/histories/detail/{ID}` (admin,client)
- DELETE `/histories/delete/{ID}` (admin)
- POST `/histories/resend-callback/{ID}` (admin,client)
- POST `/histories/retranslate/{ID}` (admin)

Request Access Token:

- GET `/access-token`

# API Auth Login Account

- Access Token: Bearer Token JWT
- Request Token: Cookies

# API Auth Translator dan API Callback

Auth Translator dan API Callback hanya berlaku untuk `/translate` dan `{callback_url}`.

Di header request, tambahkan `key_id`. Gunakan ini untuk mengambil `secret_key` dan `account_id`. Dari `secret_key`, tambahkan Auth JWT Token dengan payload body:

```json
{
  "account_id": "[ACCOUNT ID]",
  "reference_id": "[REFERENCE ID YANG SAMA DENGAN DI POST BODY]"
}
```

Sehingga backend Translator dan Client bisa saling verifikasi request dengan aman dan mudah dengan cara ambil `key_id` dari header request, lalu parse dan validasi auth jwt dengan `secret_key`.

# Dokumentasi API

Buat dokumentasi API untuk dibaca oleh programmer client dan programmer frontend admin di file README.md
