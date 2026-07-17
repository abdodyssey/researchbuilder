# Analisis Fitur Payment — ResearchBuilder (End-to-End)

> **Tanggal analisis:** 14 Juli 2026  
> **Scope:** Seluruh flow payment dari klik tombol beli di frontend hingga token masuk ke saldo user

---

## 1. Ringkasan Arsitektur

ResearchBuilder menggunakan model **Pay-As-You-Go (PAYG)** — user membeli token, menggunakannya untuk generate artikel, lalu top-up lagi saat habis. Payment gateway yang dipakai adalah **Mayar.id** via QRIS.

```
[Frontend Next.js]  ──POST /api/payment/create──►  [Backend FastAPI]
                                                          │
                                                    Mayar QRIS API
                                                          │
                    ◄──── Webhook POST /api/webhook/mayar ─┘
                    ◄──── SSE /api/payment-stream/{id}
                    ◄──── Polling GET /api/payment/{id}/status
```

**Stack teknologi:**

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript |
| Backend | FastAPI (Python), SQLAlchemy ORM |
| Database | PostgreSQL (Neon) |
| Payment Gateway | Mayar.id (QRIS) |
| Real-time | Server-Sent Events (SSE) + Polling fallback |
| Auth | JWT (HS256, 7 hari expire) |

---

## 2. Database Model

### Tabel `users`
File: `api/models.py`

```python
class User(Base):
    id                = Column(String, primary_key=True)  # UUID
    email             = Column(String, unique=True)
    tokens_purchased  = Column(Integer, default=0)   # total token yang pernah dibeli
    tokens_used       = Column(Integer, default=0)   # total token yang telah terpakai
    role              = Column(String, default="user")  # "user" | "admin"

    @property
    def tokens_balance(self) -> int:
        if self.is_admin:
            return 999_999_999   # admin = unlimited
        return max(0, self.tokens_purchased - self.tokens_used)
```

> **Key design:** Saldo dihitung secara virtual (`purchased - used`), bukan disimpan langsung. Ini mencegah race condition update saldo.

### Tabel `payments`

```python
class Payment(Base):
    id               = Column(String, primary_key=True)   # UUID internal
    user_id          = Column(ForeignKey("users.id"))
    mayar_payment_id = Column(String, unique=True)        # ID dari Mayar (cegah double-process)
    package_key      = Column(String)                     # "starter"|"standard"|"bulk"|"test_dev"
    tokens_added     = Column(Integer)                    # token yang akan ditambah
    amount           = Column(Integer)                    # harga dalam IDR
    status           = Column(String, default="pending")  # pending | paid | expired
    created_at       = Column(DateTime)
```

---

## 3. Konfigurasi Paket Token

File: `api/config/plans.py`

| Key | Label | Token | Harga | Harga/1K Token |
|---|---|---|---|---|
| `starter` | Starter | 50.000 | Rp 15.000 | Rp 300 |
| `standard` | Standard | 200.000 | Rp 50.000 | Rp 250 ⭐ |
| `bulk` | Bulk | 600.000 | Rp 120.000 | Rp 200 |
| `test_dev` | Test Dev | 5.000 | Rp 1.000 | — (admin only) |

Paket `test_dev` hanya tampil untuk user `role === "admin"` atau email mengandung `"dummy"`.

---

## 4. Flow Code End-to-End

### FASE 1 — User Memilih Paket (Frontend)

**File:** `src/app/(app)/billing/page.tsx` — fungsi `handleBuy()`

```typescript
async function handleBuy(packageKey: string) {
  setBuying(packageKey);  // tampilkan loading spinner

  // POST ke backend dengan JWT di header (via authFetch)
  const resp = await authFetch("/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package: packageKey }),
  });

  if (resp.ok) {
    const data = await resp.json();
    // Simpan data checkout ke state → tampilkan modal QRIS
    setQrisData({
      paymentId: data.payment_id,
      qrUrl: data.qr_url,
      amount: data.amount,
      packageLabel: data.package_label,
      tokens: data.tokens,
    });
  }
}
```

`authFetch` (di `AuthContext.tsx`) secara otomatis menyisipkan `Authorization: Bearer <JWT>` dan menangani 401 dengan auto-logout.

---

### FASE 2 — Backend Membuat Transaksi

**File:** `api/routers/payment.py` — `POST /api/payment/create`

**Step 1:** Validasi JWT & ambil user via dependency `get_current_user`

**Step 2:** Validasi package key
```python
pkg = get_package(req.package)   # lookup dari TOKEN_PACKAGES dict
if not pkg:
    raise HTTPException(400, "Paket tidak valid")
```

**Step 3:** Buat record Payment di DB (status `pending`)
```python
payment = Payment(
    user_id=current_user.id,
    package_key=req.package,
    tokens_added=tokens,
    amount=amount,
    status="pending",
)
db.add(payment)
db.commit()
```

**Step 4:** Panggil Mayar QRIS API
```python
# POST ke https://api.mayar.id/hl/v1/qrcode/create
{
    "amount": amount,
    "description": f"[{payment_id}] Token {label} ResearchBuilder",
    "customer": { "name": user_id, "email": "user@researchbuilder.local" },
    "metadata": { "user_id": user_id, "payment_id": payment_id }
}
```

> `payment_id` disisipkan ke `description` & `metadata` sebagai fallback matching saat webhook masuk.

**Step 5:** Simpan `mayar_product_id`, kembalikan respons ke frontend
```python
payment.mayar_payment_id = mayar_product_id
db.commit()
return { "payment_id": payment.id, "qr_url": qr_url, "amount": amount, ... }
```

---

### FASE 3 — Modal QRIS & Monitoring Real-Time (Frontend)

**File:** `src/components/QrisCheckout.tsx`

Komponen ini menjalankan **dua mekanisme paralel** setelah QR ditampilkan:

#### Mekanisme A — SSE (Server-Sent Events)
```typescript
const sseUrl = `${API_URL}/api/payment-stream/${paymentId}?token=${currentToken}`;
const eventSource = new EventSource(sseUrl);

eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.status === "success") resolve("paid");
  else if (data.status === "cancel" || data.status === "expired") resolve("expired");
  eventSource.close();
};
// Jika SSE putus → polling mengambil alih
eventSource.onerror = () => eventSource.close();
```

#### Mekanisme B — Polling Fallback (setiap 3 detik)
```typescript
const interval = setInterval(async () => {
  const res = await authFetch(`/api/payment/${paymentId}/status`);
  if (res.ok) {
    const data = await res.json();
    if (data.status === "paid")    resolve("paid");
    if (data.status === "expired") resolve("expired");
  }
}, 3000);
```

#### Timer Countdown (15 menit)
```typescript
// Setiap detik -1, jika <= 0 → setStatus("expired")
setSecondsLeft(15 * 60);
```

**State QrisCheckout:**

| Status | Tampilan UI |
|---|---|
| `pending` + `qrUrl` | QR image + timer countdown + tombol batalkan |
| `pending` + no `qrUrl` | Loading spinner |
| `paid` | ✅ Sukses + jumlah token + tombol Selesai |
| `expired` | ⚠️ QR kadaluwarsa + tombol Tutup |
| `cancelled` | ✖ Dibatalkan user |

---

### FASE 4 — Backend SSE Stream

**File:** `api/routers/payment.py` — `GET /api/payment-stream/{payment_id}`

```python
# In-memory queue: payment_id → asyncio.Queue
active_connections: dict[str, asyncio.Queue] = {}

@router.get("/payment-stream/{payment_id}")
async def payment_stream(payment_id: str, token: str, db: Session):
    user_id = decode_token(token)   # auth via query param (EventSource tdk support header)

    queue = asyncio.Queue()
    active_connections[payment_id] = queue   # register

    async def event_generator():
        try:
            status = await asyncio.wait_for(queue.get(), timeout=960)  # tunggu max 16 menit
            yield f"data: {json.dumps({'status': status})}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'status': 'expired'})}\n\n"
        finally:
            active_connections.pop(payment_id, None)   # cleanup

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

> **⚠️ Limitasi:** `active_connections` in-memory — hanya bekerja di **single-worker**. Multi-worker Gunicorn bisa menyebabkan webhook masuk ke worker berbeda dari SSE. Solusi: Redis pub/sub.

---

### FASE 5 — Webhook Mayar (Konfirmasi Pembayaran)

**File:** `api/routers/payment.py` — `POST /api/webhook/mayar`

**Step 1:** Parse event
```python
event = payload.get("event", "")
# PAYMENT_SUCCESS_EVENTS = {"payment.received", "payment.success", "payment.paid", ""}
# PAYMENT_CANCEL_EVENTS  = {"payment.failed", "payment.cancelled"}
```

**Step 2:** Match payment di DB — 4 lapisan fallback
```
Layer 1: productId           → Payment.mayar_payment_id == productId
Layer 2: transactionId       → Payment.mayar_payment_id == txn_id
Layer 3: parse dari description → "[{payment.id}] Token ..."
Layer 4: metadata.payment_id → Payment.id == meta_payment_id
```

**Step 3:** Idempotency check
```python
if payment.status == "paid":
    return {"status": "ok", "message": "Already processed"}
```

**Step 4:** Atomic DB update (SQL-level, bukan Python RMW)
```python
# Update Payment status: pending → paid
rows = db.execute(
    update(Payment)
    .where(Payment.id == payment.id, Payment.status == "pending")
    .values(status="paid", mayar_payment_id=mayar_txn_id)
).rowcount

if rows == 0:
    return {"status": "ok", "message": "Already processed"}  # race condition guard

# SQL-level increment aman untuk concurrent request
db.execute(
    update(User)
    .where(User.id == payment.user_id)
    .values(tokens_purchased=User.tokens_purchased + payment.tokens_added)
)
db.commit()
```

**Step 5:** Push notifikasi ke SSE queue
```python
queue = active_connections.get(payment.id)
if queue:
    await queue.put(sse_status)   # push ke frontend yang masih connect
```

---

### FASE 6 — Frontend Mendeteksi Sukses & Refresh State

```typescript
// billing/page.tsx
async function handlePaymentComplete() {
    setQrisData(null);        // tutup modal
    await refreshProfile();   // GET /api/auth/me → saldo terbaru
    refetchInvoices();        // GET /api/payments/history → riwayat terbaru
    window.location.reload(); // hard reload untuk sync semua state
}
```

---

### FASE 7 — Status Check Endpoint (Polling Backend)

**File:** `api/routers/payment.py` — `GET /api/payment/{payment_id}/status`

```python
# Auto-expire jika sudah lebih dari 16 menit
if payment.status == "pending" and payment.created_at:
    age_seconds = (datetime.now(utc) - payment.created_at).total_seconds()
    if age_seconds > 960:
        db.execute(update(Payment).where(...).values(status="expired"))
        db.commit()

return {"status": payment.status, "tokens_added": payment.tokens_added}
```

---

### FASE 8 — Riwayat Pembelian

**File:** `api/routers/payment.py` — `GET /api/payments/history`

```python
payments = db.query(Payment).filter(
    Payment.user_id == current_user.id,
    Payment.status == "paid"
).order_by(Payment.created_at.desc()).offset(offset).limit(page_size).all()

return [{"id": p.id[:8], "tokens_added": p.tokens_added, "amount": p.amount, ...}]
```

ID dipotong 8 karakter pertama untuk tampilan tabel (format: `TXN-XXXXXXXX`).

---

## 5. Endpoint Summary

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/payment/create` | JWT Bearer | Buat transaksi + generate QRIS |
| `GET` | `/api/payment/{id}/status` | JWT Bearer | Cek status pembayaran (polling) |
| `GET` | `/api/payment-stream/{id}` | JWT query param | SSE real-time status push |
| `POST` | `/api/webhook/mayar` | Publik (dari Mayar) | Konfirmasi pembayaran masuk |
| `GET` | `/api/payments/history` | JWT Bearer | Riwayat transaksi sukses |
| `GET` | `/api/payment/mock-checkout` | Publik | Halaman simulasi (dev/sandbox) |

---

## 6. Token Usage Guard

File: `api/auth.py` — `check_token_limit()`

```python
def check_token_limit(user: User, db: Session, required: int, operation: str):
    if user.is_admin: return   # admin bypass

    balance = user.tokens_balance
    if balance < required:
        raise HTTPException(
            status_code=402,   # Payment Required
            detail={
                "code": "insufficient_tokens",
                "balance": balance,
                "required": required,
                "shortfall": required - balance,
            }
        )
```

Guard ini dipanggil sebelum setiap operasi AI berdasarkan estimasi `TOKEN_COST`:

| Operasi | Estimasi Token Minimum |
|---|---|
| Generate judul | 3.000 |
| Literatur & outline | 20.000 |
| Penulisan artikel | 25.000 |

---

## 7. Sandbox / Mock Mode

File: `api/routers/payment.py` — `GET /api/payment/mock-checkout`

Halaman HTML simulasi — tombol "Bayar Sekarang" langsung POST ke `/api/webhook/mayar` dengan `event: "payment.success"` tanpa melalui Mayar asli. Berguna untuk testing lokal.

---

## 8. Diagram Alur Lengkap

```
USER
 │
 ▼
[Billing Page] ──► handleBuy("standard")
                        │
                   POST /api/payment/create (JWT)
                        │
              ┌─── [FastAPI] ─────────────────────┐
              │  1. validate JWT                   │
              │  2. get_package("standard")        │
              │  3. INSERT Payment (pending)       │
              │  4. POST Mayar QRIS API            │
              │  5. save mayar_product_id          │
              │  6. return { payment_id, qr_url }  │
              └───────────────────────────────────┘
                        │
                   setQrisData(...) → Modal QRIS muncul
                        │
              ┌─── [QrisCheckout] ─────────────────┐
              │  Tampilkan QR Image (dari qr_url)   │
              │  Sambung SSE /api/payment-stream    │
              │  Polling /api/payment/{id}/status   │
              │  Countdown timer 15 menit           │
              └────────────────────────────────────┘
                        │
              USER scan QR di aplikasi bank/e-wallet
                        │
              ┌─── [Mayar Server] ─────────────────┐
              │  Konfirmasi bayar berhasil          │
              │  POST /api/webhook/mayar            │
              └────────────────────────────────────┘
                        │
              ┌─── [Webhook Handler] ──────────────┐
              │  1. Parse event                    │
              │  2. Match payment (4 layers)       │
              │  3. Idempotency check              │
              │  4. UPDATE Payment → "paid"        │
              │  5. SQL-level +tokens_purchased    │
              │  6. Push SSE queue                 │
              └────────────────────────────────────┘
                        │
              SSE / Polling deteksi status "paid"
                        │
              resolve("paid") → UI ✅ Sukses
                        │
              User klik "Selesai"
                        │
              handlePaymentComplete()
              ├── refreshProfile()    → saldo terbaru
              ├── refetchInvoices()   → riwayat terbaru
              └── window.location.reload()
```

---

## 9. Potensi Improvement

| Issue | Detail | Rekomendasi |
|---|---|---|
| SSE single-worker | `active_connections` in-memory, tidak bisa multi-worker | Gunakan Redis pub/sub |
| Webhook tanpa signature | Tidak ada verifikasi HMAC dari Mayar | Tambah verifikasi `X-Mayar-Signature` header |
| Email customer hardcoded | `"email": "user@researchbuilder.local"` di QRIS create | Ganti dengan email user aktual |
| Hard reload setelah bayar | `window.location.reload()` di `handlePaymentComplete` | Ganti dengan state update reaktif |
| Expire check on-demand | Auto-expire hanya saat polling hit endpoint status | Pertimbangkan background job periodic cleanup |

---

## 10. Environment Variables

> **Lokasi file:**
> - Backend → `api/.env` (dibaca via `python-dotenv`)
> - Frontend → `.env` / `.env.local` (dibaca via Next.js `process.env`)
> - Deploy backend (VPS) → environment variable di shell / systemd service
> - Deploy frontend (Vercel) → Vercel Dashboard → Settings → Environment Variables

---

### Backend (`api/.env` / VPS environment)

#### 🔴 Wajib — Sistem tidak akan berjalan tanpa ini

| Variable | Contoh Nilai | Keterangan |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host/db?sslmode=require` | PostgreSQL connection string. Format `postgresql://` atau `postgres://` otomatis di-normalize ke driver psycopg3. **Wajib ada**, app akan crash jika kosong. |
| `SECRET_KEY` | `6afaf00f7814fa9a...` (hex 64 char) | Secret untuk sign JWT. **Wajib di production** — jika kosong di prod, server langsung throw `RuntimeError`. Di dev, otomatis generate random key (JWT hangus tiap restart). Generate dengan: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GROQ_API_KEY` | `gsk_xxxxx` | API key Groq LLM untuk generate konten artikel. |
| `MAYAR_API_KEY` | `eyJhbGci...` (JWT token dari Mayar dashboard) | API key Mayar untuk membuat QRIS. **Jika kosong, endpoint `/api/payment/create` return HTTP 500** dengan pesan user-friendly. Ambil dari: [Mayar Dashboard → Developer → API Key](https://mayar.id). |

#### 🟡 Opsional — Fitur tertentu tidak aktif jika kosong

| Variable | Default | Keterangan |
|---|---|---|
| `MAYAR_WEBHOOK_SECRET` | — | Secret HMAC untuk verifikasi webhook dari Mayar. **Saat ini belum diimplementasikan di kode** (lihat Improvement #2). Siapkan untuk nanti. |
| `RESEND_API_KEY` | — | API key [Resend.com](https://resend.com) untuk kirim email verifikasi. Jika kosong, magic link dicetak ke `stdout` (dev mode). |
| `EMAIL_FROM` | — | Nama & alamat pengirim email, contoh: `ResearchBuilder <noreply@domain.com>` |
| `APP_BASE_URL` | — | URL frontend untuk link di email verifikasi, contoh: `https://researchbuilder.rafanovation.cloud` |
| `TAVILY_API_KEY` | — | API key Tavily untuk web search agent. |
| `ENVIRONMENT` | `development` | Set ke `production` di server prod. Mempengaruhi validasi `SECRET_KEY` (di prod wajib ada). |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model Groq yang dipakai. |
| `OUTPUT_DIR` | `./output` | Direktori output file lokal. |
| `DEFAULT_LANGUAGE` | `id` | Bahasa default artikel (`id` / `en`). |
| `MAX_REFERENCES` | `10` | Jumlah maksimum referensi per artikel. |
| `ARTICLE_WORD_TARGET` | `3500` | Target jumlah kata per artikel. |

---

### Frontend (`.env.local` / Vercel Dashboard)

#### 🔴 Wajib

| Variable | Contoh Nilai | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.rafanovation.cloud` | URL backend FastAPI. **Harus prefix `NEXT_PUBLIC_`** agar ter-expose ke browser. Jika tidak di-set, frontend fallback ke URL ngrok hardcoded di `AuthContext.tsx` (hanya untuk dev lokal). |

---

### Perbandingan Dev vs Production

| Variable | Development | Production |
|---|---|---|
| `DATABASE_URL` | Bisa pakai SQLite lokal atau Neon dev branch | Neon PostgreSQL pooled (PgBouncer) dengan `sslmode=require` |
| `SECRET_KEY` | Boleh kosong (auto-generate, JWT hangus tiap restart) | **Wajib diset** — server crash jika kosong |
| `MAYAR_API_KEY` | Boleh kosong → pakai mock-checkout (`/api/payment/mock-checkout`) | **Wajib diset** → produksi QRIS nyata |
| `RESEND_API_KEY` | Boleh kosong → magic link di stdout | **Wajib diset** → email verifikasi terkirim |
| `ENVIRONMENT` | `development` (default) | `production` |
| `NEXT_PUBLIC_API_URL` | URL ngrok atau `http://localhost:8000` | URL backend production |
| `APP_BASE_URL` | `http://localhost:3000` | URL frontend production |

---

### Template `.env` Siap Pakai

#### `api/.env` — Development
```bash
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/researchbuilder
# atau Neon dev branch:
# DATABASE_URL=postgresql://neondb_owner:xxx@ep-xxx.neon.tech/neondb?sslmode=require

# ── Auth ──────────────────────────────────────────────────────────────────────
# SECRET_KEY boleh kosong di dev (auto-generate, tidak persisten)
SECRET_KEY=
ENVIRONMENT=development

# ── AI ────────────────────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx

# ── Payment (opsional di dev — biarkan kosong untuk pakai mock-checkout) ──────
MAYAR_API_KEY=
MAYAR_WEBHOOK_SECRET=

# ── Email (opsional di dev — link dicetak ke stdout) ──────────────────────────
RESEND_API_KEY=
EMAIL_FROM=ResearchBuilder <noreply@localhost>
APP_BASE_URL=http://localhost:3000

# ── App Settings ──────────────────────────────────────────────────────────────
DEFAULT_LANGUAGE=id
OUTPUT_DIR=./output
MAX_REFERENCES=10
ARTICLE_WORD_TARGET=3500
```

#### `api/.env` — Production (VPS)
```bash
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+psycopg://neondb_owner:PASSWORD@ep-xxx-pooler.neon.tech/neondb?sslmode=require&channel_binding=require

# ── Auth ──────────────────────────────────────────────────────────────────────
SECRET_KEY=<64-char-hex-random>   # python -c "import secrets; print(secrets.token_hex(32))"
ENVIRONMENT=production

# ── AI ────────────────────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx

# ── Payment ───────────────────────────────────────────────────────────────────
MAYAR_API_KEY=<JWT dari Mayar Dashboard>
MAYAR_WEBHOOK_SECRET=<secret dari Mayar Dashboard>

# ── Email ─────────────────────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=ResearchBuilder <noreply@domain.com>
APP_BASE_URL=https://researchbuilder.yourdomain.com

# ── App Settings ──────────────────────────────────────────────────────────────
DEFAULT_LANGUAGE=id
OUTPUT_DIR=./output
MAX_REFERENCES=10
ARTICLE_WORD_TARGET=3500
```

#### `.env.local` — Frontend (Next.js)
```bash
# Development
NEXT_PUBLIC_API_URL=http://localhost:8000
# atau jika pakai ngrok:
# NEXT_PUBLIC_API_URL=https://xxxx.ngrok-free.app
```

#### Vercel Dashboard — Production
```bash
NEXT_PUBLIC_API_URL=https://api.rafanovation.cloud
```

---

*Laporan dibuat berdasarkan analisis source code per 14 Juli 2026.*
