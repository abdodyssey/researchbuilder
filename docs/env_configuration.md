# Panduan Konfigurasi Environment Variables (Pydantic Settings)

Dokumen ini menjelaskan sistem konfigurasi terpusat berbasis **Pydantic Settings** pada backend **ResearchBuilder**. Sistem ini menggantikan pemanggilan manual `dotenv` dan `os.getenv()` yang tersebar, dengan validasi tipe data otomatis, *fail-fast error handling* untuk keamanan produksi, serta fallback pencarian file `.env` yang fleksibel.

---

## 1. Cara Kerja Pydantic Settings

Semua konfigurasi didefinisikan secara deklaratif di kelas `Settings` dalam file [settings.py](file:///home/devtective/researchpilot/api/config/settings.py). 

Sistem memuat konfigurasi menggunakan urutan prioritas berikut:
1. **Variabel Lingkungan Sistem (System Environment Variables):** Variabel yang di-inject langsung ke memori (misalnya via Supervisor di VPS, Docker, atau terminal session). Ini adalah cara teraman untuk production.
2. **File `.env`:** File konfigurasi lokal. Pydantic Settings secara otomatis mencari file `.env` pada:
   * Root repository: `/home/devtective/researchpilot/.env`
   * Folder API: `/home/devtective/researchpilot/api/.env`

---

## 2. Katalog Environment Variables

Berikut adalah daftar variabel lingkungan yang didukung oleh backend ResearchBuilder:

| Nama Variabel | Tipe Data | Nilai Default | Wajib di Produksi? | Deskripsi & Kegunaan |
| :--- | :--- | :--- | :---: | :--- |
| **`ENVIRONMENT`** | `str` | `"development"` | Tidak | Menentukan mode aplikasi (`"production"` atau `"development"`). |
| **`SECRET_KEY`** | `str` | *Acak (Dev Only)* | **YA** | Key rahasia untuk enkripsi JWT. Di mode `production`, server akan crash jika kosong. Di mode `development`, key acak otomatis digenerate per-restart server. |
| **`DATABASE_URL`** | `str` | *Tanpa Default* | **YA** | URL PostgreSQL (misalnya URL pooling Neon/Supabase). Format otomatis dinormalisasi menggunakan skema `postgresql+psycopg://`. |
| **`GROQ_API_KEY`** | `str` | `"missing_api_key_on_vercel"` | **YA** | API Key untuk memanggil LLM Groq Cloud. |
| **`GROQ_MODEL`** | `str` | `"llama-3.3-70b-versatile"` | Tidak | Model utama LLM untuk generasi artikel. Jika model ini terkena rate limit, otomatis fallback ke `llama-3.1-8b-instant`. |
| **`SEMANTIC_SCHOLAR_API_KEY`** | `str` \| `None` | `None` | Tidak | API Key untuk Semantic Scholar. Jika diisi, query pencarian akan memiliki kuota rate-limit lebih tinggi (Premium). Jika kosong, menggunakan mode publik (Shared rate-limit). |
| **`MAYAR_API_KEY`** | `str` \| `None` | `None` | **YA** | API Key Mayar (Bearer token) untuk membuat tagihan QRIS dinamis. |
| **`MAYAR_WEBHOOK_SECRET`** | `str` \| `None` | `None` | Tidak | Secret key webhook Mayar untuk validasi payload signature (opsional/deprecated). |
| **`RESEND_API_KEY`** | `str` \| `None` | `None` | **YA** | API Key Resend untuk kirim email verifikasi akun. Jika kosong, tautan aktivasi akan dicetak langsung ke console stdout server (Dev mode). |
| **`EMAIL_FROM`** | `str` | `"ResearchBuilder <onboarding@resend.dev>"` | Tidak | Identitas email pengirim verifikasi (harus domain yang sudah diverifikasi di Resend). |
| **`APP_BASE_URL`** | `str` | `"http://localhost:3000"` | Tidak | URL dasar frontend (digunakan untuk membuat tautan aktivasi email). |
| **`OUTPUT_DIR`** | `str` | `"./output"` | Tidak | Direktori penyimpanan output file draft artikel (`.md`, `.docx`) dan JSON state pencapaian pipeline. |
| **`DEFAULT_LANGUAGE`** | `str` | `"id"` | Tidak | Bahasa default untuk naskah artikel riset (`"id"` atau `"en"`). |
| **`MAX_REFERENCES`** | `int` | `10` | Tidak | Jumlah referensi jurnal default yang dicari di web/Semantic Scholar saat pipeline berjalan. |
| **`ARTICLE_WORD_TARGET`** | `int` | `3500` | Tidak | Estimasi jumlah kata naskah artikel yang dihasilkan. |

---

## 3. Fitur Keamanan & Validasi Otomatis

### Fail-Fast di Produksi
Jika variabel `ENVIRONMENT` bernilai `"production"`, sistem secara otomatis memvalidasi keberadaan `SECRET_KEY`. Jika kunci tidak ada/kosong, server uvicorn akan langsung crash saat inisialisasi awal dengan pesan error yang jelas:
```text
RuntimeError: SECRET_KEY environment variable wajib di-set di produksi. Generate dengan: python -c "import secrets; print(secrets.token_hex(32))"
```
Ini mencegah Anda secara tidak sengaja menjalankan aplikasi di production dengan JWT key yang tidak persisten atau lemah.

### Auto-Casting
Pydantic secara otomatis mengubah tipe data string dari environment ke tipe data Python asli:
* `MAX_REFERENCES="20"` otomatis dibaca sebagai integer `20`.
* `SEMANTIC_SCHOLAR_API_KEY=""` otomatis dibaca sebagai `None`.

---

## 4. Cara Menyuntikkan Variabel di VPS (Tanpa File `.env`)

Untuk meningkatkan keamanan di VPS produksi, hindari menulis file `.env` fisik. Sebaliknya, daftarkan variabel langsung ke dalam konfigurasi Supervisor `/home/pharis_ai/.config/supervisor/supervisord.conf` menggunakan direktif `environment`:

```ini
[program:researchbuilder]
directory=%(ENV_HOME)s/researchbuilder
command=%(ENV_HOME)s/researchbuilder/api/.venv/bin/uvicorn api.index:app --host 0.0.0.0 --port 8000
autostart=true
autorestart=true
# Menyuntikkan konfigurasi langsung ke memori proses:
environment=ENVIRONMENT="production",SECRET_KEY="hasil_generate_token_hex_anda",DATABASE_URL="postgresql+psycopg://...",MAYAR_API_KEY="re_...",RESEND_API_KEY="re_..."
```

Setelah mengubah file Supervisor, restart Supervisor dengan perintah:
```bash
supervisorctl -c ~/.config/supervisor/supervisord.conf update
supervisorctl -c ~/.config/supervisor/supervisord.conf restart researchbuilder
```

---

## 5. Cara Menambahkan Variabel Baru

Jika Anda ingin menambahkan konfigurasi environment variable baru di kemudian hari, ikuti langkah berikut:

1. Buka file [settings.py](file:///home/devtective/researchpilot/api/config/settings.py).
2. Tambahkan properti baru di dalam kelas `Settings` dengan deklarasi tipe data dan nilai default (jika ada):
   ```python
   class Settings(BaseSettings):
       # ... variabel lama ...
       
       # Tambahkan variabel baru Anda di sini:
       NAMA_VARIABEL_BARU: str = "default_value"
       PORT_BARU: int = 5000  # Pydantic otomatis memvalidasi integer
   ```
3. Impor instance `settings` di mana pun Anda membutuhkannya pada kode backend Anda:
   ```python
   from config.settings import settings
   
   print(settings.NAMA_VARIABEL_BARU)
   ```
