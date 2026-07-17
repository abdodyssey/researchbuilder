# Bug Report — Fitur Payment ResearchBuilder

> **Tanggal:** 14 Juli 2026  
> **Metode:** Static code analysis end-to-end  
> **File yang dianalisis:** `api/routers/payment.py`, `src/components/QrisCheckout.tsx`, `src/app/(app)/billing/page.tsx`, `api/models.py`

---

## Ringkasan Temuan

| # | Severity | Lokasi | Judul |
|---|---|---|---|
| 1 | 🔴 KRITIS | `payment.py` L474–556 | Mock-checkout webhook tidak bisa matching payment |
| 2 | 🟠 MEDIUM | `payment.py` L377–426 | Cancelled payment tidak di-update di DB |
| 3 | 🟠 MEDIUM | `payment.py` L200–218 | Orphaned Payment record saat MAYAR_API_KEY kosong |
| 4 | 🟡 LOW | `QrisCheckout.tsx` L66–68 | Status `"cancel"` dari gateway dipetakan ke UI "Expired" |
| 5 | 🟡 LOW | `payment.py` L238–244 | Flag `mock` tidak pernah dikirim backend ke frontend |

---

## Bug #1 — 🔴 KRITIS: Mock-checkout Webhook Tidak Bisa Matching Payment

### Lokasi
- `api/routers/payment.py`, baris **540–553** (JS mock checkout) 
- `api/routers/payment.py`, baris **100–179** (`_find_matching_payment`)

### Deskripsi

Halaman mock-checkout (`/api/payment/mock-checkout`) mengirim payload webhook berikut saat tombol "Bayar Sekarang" diklik:

```javascript
// Baris 547 — JS di dalam HTML mock-checkout
body: JSON.stringify({
    event: "payment.success",
    data: {
        paymentId: "{payment_id}",   // ← ini adalah INTERNAL UUID (Payment.id)
        amount: {amount},
        customer: { email: "{email}" }
    }
})
```

Sekarang lihat bagaimana `_find_matching_payment` mencari payment di DB:

```
Layer 1: productId           → tidak ada di payload → SKIP
Layer 2: paymentId           → ada! nilainya = internal UUID (Payment.id)
          → query: Payment.mayar_payment_id == internal_uuid  → GAGAL
            (mayar_payment_id berisi ID dari Mayar, BUKAN internal UUID)
Layer 3: description parsing → tidak ada di payload → SKIP
Layer 4: metadata.payment_id → tidak ada di payload → SKIP

Hasil: return None → "No matching pending payment found"
```

**Akibat:** Klik "Bayar Sekarang" di mock-checkout tidak pernah mengkonfirmasi payment. Token tidak pernah ditambahkan. Webhook return 200 tapi tidak ada yang terjadi di DB.

### Root Cause

Payload mock JS menggunakan `paymentId` berisi **internal** `Payment.id` (UUID kita), sedangkan Layer 2 di `_find_matching_payment` mencocokkan terhadap kolom `Payment.mayar_payment_id` yang berisi **external** ID dari Mayar.

Kedua ID ini berbeda:
- `Payment.id` = UUID internal yang kita generate (`uuid4()`)
- `Payment.mayar_payment_id` = ID produk QRIS dari Mayar API (e.g. `qr_xxxx`)

### Fix

Tambahkan `metadata` atau `description` ke payload mock agar Layer 3 atau Layer 4 bisa match:

```javascript
// payment.py baris 547 — SEBELUM (BROKEN)
body: JSON.stringify({
    event: "payment.success",
    data: {
        paymentId: "{payment_id}",
        amount: {amount},
        customer: {{ email: "{email}" }}
    }
})

// SESUDAH (FIX) — tambahkan metadata agar Layer 4 bisa match
body: JSON.stringify({
    event: "payment.success",
    data: {
        paymentId: "{payment_id}",
        amount: {amount},
        customer: {{ email: "{email}" }},
        description: "[{payment_id}] Token {pkg_label} ResearchBuilder",
        metadata: {{ payment_id: "{payment_id}" }}
    }
})
```

---

## Bug #2 — 🟠 MEDIUM: Cancelled Payment Tidak Di-Update di DB

### Lokasi
- `api/routers/payment.py`, baris **376–426**

### Deskripsi

Perhatikan logika di webhook handler setelah payment ditemukan:

```python
# Baris 377–383
if event in PAYMENT_CANCEL_EVENTS:
    sse_status = "cancel"
elif event in PAYMENT_SUCCESS_EVENTS:
    sse_status = "success"

# Baris 391–418 — HANYA dijalankan untuk success!
if sse_status == "success":
    db.execute(update(Payment).where(...).values(status="paid"))
    db.execute(update(User).where(...).values(tokens_purchased=...))
    db.commit()

# Baris 421–426 — push ke SSE (untuk semua status)
queue = active_connections.get(payment.id)
if queue:
    await queue.put(sse_status)  # push "cancel"
```

Ketika Mayar mengirim event `payment.failed` atau `payment.cancelled`:

1. ✅ SSE push "cancel" berhasil **jika** client masih terhubung
2. ❌ **DB tidak diupdate** — payment tetap `status="pending"` selamanya

### Skenario Bug

**Skenario A — SSE aktif:**
User masih buka modal QR. SSE push "cancel" diterima → frontend set status "expired" (bug #4). Tapi DB masih "pending". User klik tombol lain, buka payment lagi → **bisa terjadi transaksi ganda** karena payment lama tidak ditutup dengan bersih.

**Skenario B — SSE sudah putus (paling berbahaya):**
Koneksi SSE drop (ngrok timeout, dll). Hanya polling yang berjalan.  
Polling setiap 3 detik → selalu dapat `status="pending"` (bukan "cancelled").  
User menunggu **15 menit penuh** (frontend timer) baru modal tertutup.  
Padahal transaksi sudah dibatalkan oleh Mayar.

### Fix

Tambahkan DB update untuk status "cancel":

```python
# payment.py setelah baris 391 — tambahkan blok ini

if sse_status == "cancel":
    db.execute(
        update(Payment)
        .where(Payment.id == payment.id, Payment.status == "pending")
        .values(status="cancelled")
    )
    db.commit()

if sse_status == "success":
    # ... kode existing ...
```

Dan di frontend, tambahkan polling check untuk status "cancelled":
```typescript
// QrisCheckout.tsx
if (data.status === "paid")      resolve("paid");
if (data.status === "expired")   resolve("expired");
if (data.status === "cancelled") resolve("cancelled");  // tambahkan ini
```

---

## Bug #3 — 🟠 MEDIUM: Orphaned Payment Records Saat MAYAR_API_KEY Kosong

### Lokasi
- `api/routers/payment.py`, baris **200–218**

### Deskripsi

```python
# Baris 200–209 — Payment di-INSERT dulu ke DB
payment = Payment(user_id=..., status="pending", ...)
db.add(payment)
db.commit()          # ← record sudah tersimpan permanen
db.refresh(payment)

# Baris 211–218 — BARU cek API key
mayar_api_key = os.getenv("MAYAR_API_KEY")
if not mayar_api_key:
    raise HTTPException(500, "Sistem pembayaran sedang tidak tersedia...")
    # ← frontend dapat 500, TIDAK punya payment_id
    # ← payment record di DB → yatim piatu selamanya
```

**Akibat:**
- Setiap kali user klik "Beli" saat `MAYAR_API_KEY` tidak ada → 1 orphaned Payment record dengan `status="pending"` tersimpan di DB
- Karena frontend tidak pernah dapat `payment_id`, tidak ada yang pernah poll endpoint status → auto-expire (16 menit) tidak pernah terpicu
- Record ini akan menumpuk di DB selamanya

**Ini juga berarti:** Jika MAYAR_API_KEY kemudian diisi dan Mayar webhook datang, **Layer 4** matching bisa secara teori match ke orphaned payment karena format payment_id sama. Risiko kecil tapi ada.

### Fix

Lakukan pengecekan MAYAR_API_KEY **sebelum** menyimpan Payment ke DB:

```python
# SEBELUM membuat Payment record
mayar_api_key = os.getenv("MAYAR_API_KEY")
if not mayar_api_key:
    raise HTTPException(
        status_code=500,
        detail="Sistem pembayaran sedang tidak tersedia saat ini."
    )

# BARU buat payment record
payment = Payment(user_id=..., status="pending", ...)
db.add(payment)
db.commit()
```

---

## Bug #4 — 🟡 LOW: Status "cancel" dari Gateway Menampilkan UI "Expired"

### Lokasi
- `src/components/QrisCheckout.tsx`, baris **63–69**

### Deskripsi

Backend SSE mengirim `{"status": "cancel"}` ketika Mayar mengirim event `payment.failed` atau `payment.cancelled`.

```typescript
// QrisCheckout.tsx baris 63–69
eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.status === "success") resolve("paid");
    else if (data.status === "cancel" || data.status === "expired") resolve("expired");
    //                     ^^^^^^^^                                           ^^^^^^^
    //                     cancel → dipetakan ke state "expired" ← SALAH!
};
```

**Akibat:** Ketika Mayar membatalkan transaksi (user batal bayar di aplikasi bank), user melihat tampilan **"QR Kedaluwarsa"** bukan **"Pembayaran Dibatalkan"**. Pesan yang salah dapat membingungkan user — mereka akan mencoba scan lagi padahal transaksi sudah cancelled, bukan expired.

Komponen sudah punya state `"cancelled"` yang menampilkan pesan yang tepat:
```tsx
{status === "cancelled" && (
    <XCircle ... />
    <p>Pembayaran Dibatalkan</p>  // ← ini yang seharusnya muncul
)}
```

Tapi state ini hanya bisa diaktifkan via tombol "Batalkan Pembayaran" di UI, bukan dari server.

### Fix

```typescript
// QrisCheckout.tsx — SEBELUM
else if (data.status === "cancel" || data.status === "expired") resolve("expired");

// SESUDAH
else if (data.status === "cancel") resolve("cancelled");
else if (data.status === "expired") resolve("expired");
```

---

## Bug #5 — 🟡 LOW: Flag `mock` Tidak Pernah Dikirim Backend

### Lokasi
- `api/routers/payment.py`, baris **238–244**
- `src/app/(app)/billing/page.tsx`, baris **87**
- `src/components/QrisCheckout.tsx`, baris **33**

### Deskripsi

Di `billing/page.tsx`:
```typescript
setQrisData({
    paymentId: data.payment_id,
    qrUrl: data.qr_url,
    amount: data.amount,
    packageLabel: data.package_label,
    tokens: data.tokens,
    mock: data.mock,   // ← membaca data.mock dari response backend
});
```

Di `QrisCheckout.tsx`:
```typescript
const [status, setStatus] = useState<Status>(mock ? "paid" : "pending");
// Jika mock=true → langsung status "paid" tanpa menunggu apapun
```

Di `payment.py`, response dari `/api/payment/create`:
```python
return {
    "payment_id": payment.id,
    "qr_url": qr_url,
    "amount": amount,
    "package_label": label,
    "tokens": tokens,
    # ← tidak ada field "mock" sama sekali!
}
```

**Akibat:** `data.mock` di frontend selalu `undefined` → `mock` prop selalu falsy → kode mock di `QrisCheckout` tidak pernah aktif via alur normal. Ini dead code yang tidak berfungsi.

### Fix

Jika mock mode memang diinginkan (misal untuk `test_dev` package saat dev environment), tambahkan flag `mock` di response:

```python
# payment.py
return {
    "payment_id": payment.id,
    "qr_url": qr_url,
    "amount": amount,
    "package_label": label,
    "tokens": tokens,
    "mock": os.getenv("ENVIRONMENT", "development") == "development" and req.package == "test_dev",
}
```

Atau hapus saja kode mock dari frontend jika memang tidak dipakai.

---

## Diagram Alur Bug #1 (Mock-Checkout)

```
User akses GET /api/payment/mock-checkout?payment_id=UUID&...
                    │
             Render halaman HTML
                    │
             User klik "Bayar Sekarang"
                    │
          POST /api/webhook/mayar
          {
            event: "payment.success",
            data: {
              paymentId: "INTERNAL-UUID",   ← internal Payment.id
              amount: 50000,
              customer: { email: "..." }
            }
          }
                    │
          _find_matching_payment(db, data)
                    │
          Layer 1: productId?       → None  → SKIP
          Layer 2: paymentId match? → query Payment WHERE mayar_payment_id = "INTERNAL-UUID"
                                    → NOT FOUND (mayar_payment_id = Mayar's qr_xxx, bukan UUID)
          Layer 3: description?     → None  → SKIP
          Layer 4: metadata?        → None  → SKIP
                    │
          return None
                    │
          return {"status": "ok", "message": "No matching pending payment found"}
          ← HTTP 200, tapi payment TIDAK diproses, token TIDAK ditambah
```

---

## Diagram Alur Bug #2 (Cancelled Payment)

```
Mayar server → POST /api/webhook/mayar { event: "payment.cancelled" }
                    │
          sse_status = "cancel"
                    │
          ┌─ if sse_status == "success": ─┐
          │   (TIDAK masuk blok ini)       │
          └───────────────────────────────┘
                    │
          DB: Payment.status masih "pending" ← TIDAK diupdate
                    │
          SSE queue push "cancel" (jika client terhubung)
                    │
          ┌── Skenario A: SSE aktif ──────┐  ┌── Skenario B: SSE putus ────────┐
          │  Frontend resolve("expired")  │  │  Polling GET /status             │
          │  UI "QR Kedaluwarsa" (bug #4) │  │  → response: {status: "pending"} │
          │  DB masih "pending"           │  │  → polling TIDAK resolve         │
          └───────────────────────────────┘  │  → user tunggu 15 menit penuh    │
                                             └──────────────────────────────────┘
```

---

## Priority Fix Order

1. **Bug #3** (orphaned records) — fix 1 baris, paling mudah, langsung berdampak ke DB health
2. **Bug #1** (mock-checkout) — fix payload JS di template HTML
3. **Bug #2** (cancel not persisted) — tambah 1 blok DB update di webhook handler
4. **Bug #4** (wrong UI) — fix 1 baris di QrisCheckout
5. **Bug #5** (dead mock flag) — keputusan: implement atau hapus

---

*Analisis dibuat 14 Juli 2026.*
