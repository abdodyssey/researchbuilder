"""
Payment Router — Lifecycle Transaksi QRIS Mayar
================================================
Modul ini menangani seluruh alur pembayaran token dari pembuatan QRIS
hingga kreditkan saldo ke akun pengguna.

Endpoints:
    POST /api/payment/create         → Buat transaksi QRIS baru
    GET  /api/payment/{id}/status    → Polling status transaksi
    GET  /api/payment-stream/{id}    → SSE push notifikasi real-time
    POST /api/webhook/mayar          → Callback dari Mayar saat bayar sukses/gagal
    GET  /api/payments/history       → Riwayat pembelian token user

Arsitektur Notifikasi (Hybrid SSE + Polling):
    Klien membuka SSE stream → menunggu push dari webhook Mayar.
    Klien juga polling /status setiap 3 detik sebagai safety net.
    Webhook → update DB atomik → push ke SSE queue.

Keterbatasan Skala (diketahui, acceptable untuk MVP):
    `active_connections` disimpan in-memory → hanya bekerja di 1 worker process.
    Jika scale ke multi-worker (gunicorn -w N), ganti dengan Redis pub/sub.
"""

import asyncio
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone, timedelta

import httpx
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel as PydanticBase
from sqlalchemy import update
from sqlalchemy.orm import Session

from auth import get_current_user, decode_token
from config.plans import get_package
from database import get_db
from models import Payment, User

router = APIRouter(prefix="/api", tags=["payment"])

# ── SSE Queue (in-memory) ─────────────────────────────────────────────────────
# payment_id → asyncio.Queue yang menerima push status dari webhook.
#
# ⚠  SINGLE-WORKER ONLY: dict ini ada di memory process ini saja.
#    Jika pakai gunicorn multi-worker, webhook bisa masuk ke worker berbeda
#    dari yang memegang SSE → queue tidak ditemukan → push tidak bekerja.
#    Polling fallback di frontend tetap menangkap perubahan status.
#    Solusi produksi skala besar: Redis pub/sub sebagai transport antar-worker.
active_connections: dict[str, asyncio.Queue] = {}

# Event Mayar yang dianggap pembayaran sukses.
# String kosong ("") dimasukkan karena beberapa versi Mayar tidak menyertakan
# field 'event' saat tes webhook manual dari dashboard — hapus setelah produksi.
PAYMENT_SUCCESS_EVENTS: frozenset[str] = frozenset(
    {"payment.received", "payment.success", "payment.paid", ""}
)
PAYMENT_CANCEL_EVENTS: frozenset[str] = frozenset(
    {"payment.failed", "payment.cancelled"}
)


# ── Request Schema ────────────────────────────────────────────────────────────


class PaymentCreateRequest(PydanticBase):
    """Body request untuk membuat transaksi baru."""

    package: str  # "starter" | "standard" | "bulk"


# ── Private Helpers ───────────────────────────────────────────────────────────


async def _call_mayar_create_qris(
    payment_id: str,
    amount: int,
    label: str,
    api_key: str,
    user_id: str,
) -> tuple[str, str]:
    """
    Panggil Mayar API untuk membuat QRIS dan kembalikan (qr_url, mayar_product_id).
    Menyisipkan user_id ke dalam customer object / metadata agar tersimpan.

    Menyematkan internal `payment_id` ke field 'description' agar webhook
    dapat dicocokkan secara deterministik tanpa perlu fallback berbasis amount.

    Args:
        payment_id: UUID internal Payment record (disematkan ke description).
        amount:     Harga dalam rupiah.
        label:      Nama paket (untuk description yang terbaca manusia).
        api_key:    MAYAR_API_KEY dari environment.

    Returns:
        (qr_url, mayar_product_id) — mayar_product_id bisa string kosong.

    Raises:
        HTTPException 502 jika Mayar tidak responsif atau respons tidak valid.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.mayar.id/hl/v1/qrcode/create",
            json={
                "amount": amount,
                "description": f"[{payment_id}] Token {label} ResearchBuilder",
                "customer": {
                    "name": user_id,  # Sisipkan user_id
                    "email": "user@researchbuilder.local",
                    "phone": "08111111111",
                },
                "metadata": {"user_id": user_id, "payment_id": payment_id},
            },
            headers=headers,
            timeout=15.0,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"Mayar QRIS API error: {resp.text}"
        )

    data = resp.json().get("data", {})
    qr_url = data.get("url")
    if not qr_url:
        raise HTTPException(
            status_code=502, detail="Mayar QRIS response missing QR URL"
        )

    return qr_url, data.get("id", "")


def _find_matching_payment(db: Session, data: dict) -> Payment | None:
    """
    Temukan Payment record yang cocok dengan data webhook Mayar.

    Strategi matching (3 lapisan, urutan prioritas):
        1. productId   → mayar_payment_id yang disimpan saat QRIS dibuat (paling akurat)
        2. transactionId / referenceId → mayar_payment_id Mayar
        3. description → payment.id internal yang disisipkan saat buat QRIS

    Fallback berbasis amount TIDAK digunakan karena berisiko salah kredit
    jika dua pengguna membeli paket berharga sama secara bersamaan.

    Args:
        db:   SQLAlchemy session aktif.
        data: Field 'data' dari payload JSON webhook Mayar.

    Returns:
        Payment record jika cocok ditemukan, None jika tidak ada.
    """
    # Lapisan 1: productId — ID produk QRIS yang disimpan saat checkout dibuat
    product_id = data.get("productId")
    if product_id:
        payment = (
            db.query(Payment)
            .filter(
                Payment.mayar_payment_id == product_id,
            )
            .first()
        )
        if payment:
            print(f"[WEBHOOK] Matched by productId={product_id}", flush=True)
            return payment

    # Lapisan 2: transactionId / referenceId dari Mayar
    mayar_txn_id = (
        data.get("id")
        or data.get("transactionId")
        or data.get("paymentId")
        or data.get("referenceId")
    )
    if mayar_txn_id:
        payment = (
            db.query(Payment)
            .filter(
                Payment.mayar_payment_id == mayar_txn_id,
            )
            .first()
        )
        if payment:
            print(f"[WEBHOOK] Matched by mayar_txn_id={mayar_txn_id}", flush=True)
            return payment

    # Lapisan 3: parse internal payment.id dari description
    # Format: "[{payment.id}] Token {label} ResearchBuilder"
    description = data.get("description") or ""
    if description.startswith("["):
        try:
            internal_id = description.split("[")[1].split("]")[0].strip()
            if internal_id:
                payment = (
                    db.query(Payment)
                    .filter(
                        Payment.id == internal_id,
                        Payment.status == "pending",
                    )
                    .first()
                )
                if payment:
                    print(
                        f"[WEBHOOK] Matched by description internal_id={internal_id}",
                        flush=True,
                    )
                    return payment
        except (IndexError, ValueError):
            pass

    # Lapisan 4: Fallback ke metadata custom user_id/payment_id jika di-echo oleh Mayar
    metadata = data.get("metadata", {})
    if isinstance(metadata, dict):
        meta_payment_id = metadata.get("payment_id")
        if meta_payment_id:
            payment = (
                db.query(Payment)
                .filter(
                    Payment.id == meta_payment_id,
                    Payment.status == "pending",
                )
                .first()
            )
            if payment:
                print(
                    f"[WEBHOOK] Matched by metadata payment_id={meta_payment_id}",
                    flush=True,
                )
                return payment

    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/payment/create")
async def create_payment_link(
    req: PaymentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Buat transaksi QRIS baru untuk pembelian token.

    Flow produksi:
        1. Validasi key paket → ambil harga & jumlah token
        2. INSERT Payment record dengan status 'pending'
        3. Panggil Mayar API → dapatkan QR URL
        4. Simpan mayar_product_id untuk matching webhook
        5. Return payment_id + qr_url ke frontend

    Flow dev (MAYAR_API_KEY tidak di-set):
        Langsung set status 'paid' dan kredit token — tidak butuh gateway asli.
        Frontend mendeteksi mock=True dan skip polling SSE.
    """
    pkg = get_package(req.package)
    if not pkg:
        raise HTTPException(status_code=400, detail="Paket tidak valid")

    amount = pkg["price"]
    tokens = pkg["tokens"]
    label = pkg["label"]

    payment = Payment(
        user_id=current_user.id,
        package_key=req.package,
        tokens_added=tokens,
        amount=amount,
        status="pending",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    mayar_api_key = os.getenv("MAYAR_API_KEY")

    # ── Security Check ────────────────────────────────────────────────────────
    if not mayar_api_key:
        raise HTTPException(
            status_code=500, 
            detail="Sistem pembayaran sedang tidak tersedia saat ini. Silakan hubungi admin."
        )

    # ── Production mode ───────────────────────────────────────────────────────
    try:
        qr_url, mayar_product_id = await _call_mayar_create_qris(
            payment_id=payment.id,
            amount=amount,
            label=label,
            api_key=mayar_api_key,
            user_id=current_user.id,
        )
        if mayar_product_id:
            payment.mayar_payment_id = mayar_product_id
            db.commit()

        print(
            f"[PAYMENT] Created QRIS — payment_id={payment.id} | "
            f"mayar_product_id={mayar_product_id}",
            flush=True,
        )
        return {
            "payment_id": payment.id,
            "qr_url": qr_url,
            "amount": amount,
            "package_label": label,
            "tokens": tokens,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error membuat QRIS: {str(e)}")


@router.get("/payment/{payment_id}/status")
async def payment_status(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cek status transaksi — digunakan sebagai polling fallback di frontend.

    Auto-expire: payment yang masih 'pending' setelah 16 menit diubah ke
    'expired' (1 menit buffer di atas timer frontend 15 menit).

    Returns:
        { status: "pending"|"paid"|"expired", tokens_added: int }
    """
    payment = (
        db.query(Payment)
        .filter(
            Payment.id == payment_id,
            Payment.user_id == current_user.id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status == "pending" and payment.created_at:
        age_seconds = (
            datetime.now(timezone.utc).replace(tzinfo=None) - payment.created_at
        ).total_seconds()
        if age_seconds > 960:  # 16 menit
            db.execute(
                update(Payment)
                .where(Payment.id == payment.id, Payment.status == "pending")
                .values(status="expired")
            )
            db.commit()
            db.refresh(payment)

    return {"status": payment.status, "tokens_added": payment.tokens_added}


@router.get("/payment-stream/{payment_id}")
async def payment_stream(
    payment_id: str,
    token: str,
    db: Session = Depends(get_db),
):
    """
    SSE endpoint — client menunggu push real-time dari webhook Mayar.

    Autentikasi via query param karena browser EventSource tidak mendukung
    custom Authorization header. Token JWT tersimpan di URL (diketahui,
    acceptable untuk MVP — lihat catatan di modul header).

    Timeout: 16 menit. Setelah itu, SSE mengirim event 'expired' dan koneksi ditutup.
    Jika koneksi terputus sebelum webhook masuk, polling /status sebagai fallback.
    """
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token tidak valid")

    payment = (
        db.query(Payment)
        .filter(
            Payment.id == payment_id,
            Payment.user_id == user_id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    queue: asyncio.Queue = asyncio.Queue()
    active_connections[payment_id] = queue

    async def event_generator():
        try:
            status = await asyncio.wait_for(queue.get(), timeout=960)
            yield f"data: {json.dumps({'status': status})}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'status': 'expired'})}\n\n"
        finally:
            active_connections.pop(payment_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Matikan buffering Nginx agar SSE real-time
        },
    )


@router.post("/webhook/mayar")
async def webhook_mayar(request: Request, db: Session = Depends(get_db)):
    """
    Callback dari Mayar — dipanggil otomatis saat pembayaran sukses atau gagal.

    Flow:
        1. (Opsional) Verifikasi HMAC-SHA256 signature dari header x-mayar-signature
        2. Cari Payment cocok via _find_matching_payment() — 3 lapisan matching
        3. Atomic SQL update: pending→paid + kredit token ke user
        4. Push notifikasi ke SSE queue jika client masih terhubung

    Idempotency: webhook retry dari Mayar aman — atomic WHERE status='pending'
    memastikan hanya 1 request yang berhasil update, sisanya rowcount=0.
    """
    body = await request.body()

    # ── Verifikasi Signature ──────────────────────────────────────────────────
    signature = request.headers.get("x-mayar-signature")
    webhook_secret = os.getenv("MAYAR_WEBHOOK_SECRET")
    allow_mock = request.headers.get("x-mock-payment") == "true" and not os.getenv(
        "MAYAR_API_KEY"
    )

    try:
        payload_preview = json.loads(body)
    except Exception:
        payload_preview = {}
    print(
        f"[WEBHOOK] Received — event={payload_preview.get('event')} | body={body[:300]}",
        flush=True,
    )

    if webhook_secret and not allow_mock:
        if not signature:
            print("[WEBHOOK] WARNING: Missing x-mayar-signature", flush=True)
        else:
            expected = hmac.new(
                webhook_secret.encode(), body, hashlib.sha256
            ).hexdigest()
            if hmac.compare_digest(expected, signature):
                print("[WEBHOOK] Signature valid ✓", flush=True)
            else:
                print(
                    f"[WEBHOOK] WARNING: Signature mismatch — expected={expected} | got={signature}",
                    flush=True,
                )
                # TODO: uncomment setelah konfirmasi format signature dari Mayar:
                # raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("event", "")
    data = payload.get("data", {})

    mayar_txn_id = (
        data.get("id")
        or data.get("transactionId")
        or data.get("paymentId")
        or data.get("referenceId")
    )
    print(
        f"[WEBHOOK] event={event!r} | mayar_txn_id={mayar_txn_id} | "
        f"data_keys={list(data.keys())}",
        flush=True,
    )

    # ── Cari Payment ──────────────────────────────────────────────────────────
    payment = _find_matching_payment(db, data)
    if not payment:
        print(
            f"[WEBHOOK] No match — txn_id={mayar_txn_id} | "
            f"description={data.get('description', '')[:80]}",
            flush=True,
        )
        return {"status": "ok", "message": "No matching pending payment found"}

    print(
        f"[WEBHOOK] Matched payment_id={payment.id} | status={payment.status}",
        flush=True,
    )

    # ── Klasifikasi Event ─────────────────────────────────────────────────────
    if event in PAYMENT_CANCEL_EVENTS:
        sse_status = "cancel"
    elif event in PAYMENT_SUCCESS_EVENTS:
        sse_status = "success"
    else:
        print(f"[WEBHOOK] Ignoring unhandled event={event!r}", flush=True)
        return {"status": "ok", "message": f"Event {event!r} not handled"}

    # ── Idempotency ───────────────────────────────────────────────────────────
    if payment.status == "paid":
        print(f"[WEBHOOK] {payment.id} already PAID — skipped (idempotent)", flush=True)
        return {"status": "ok", "message": "Already processed"}

    # ── Atomic DB Update ──────────────────────────────────────────────────────
    if sse_status == "success":
        rows = db.execute(
            update(Payment)
            .where(Payment.id == payment.id, Payment.status == "pending")
            .values(
                status="paid",
                mayar_payment_id=mayar_txn_id or payment.mayar_payment_id,
            )
        ).rowcount

        if rows == 0:
            # Race: request lain (webhook retry) sudah proses lebih dulu
            print(f"[WEBHOOK] Race condition on {payment.id} — skipped", flush=True)
            return {"status": "ok", "message": "Already processed"}

        # SQL-level increment — aman untuk concurrent, bukan Python RMW
        db.execute(
            update(User)
            .where(User.id == payment.user_id)
            .values(tokens_purchased=User.tokens_purchased + payment.tokens_added)
        )
        db.commit()
        db.refresh(payment)
        print(
            f"[WEBHOOK] ✅ {payment.id} PAID — +{payment.tokens_added} tokens "
            f"→ user_id={payment.user_id}",
            flush=True,
        )

    # ── Push ke SSE (jika client masih terhubung) ─────────────────────────────
    queue = active_connections.get(payment.id)
    if queue:
        await queue.put(sse_status)
        print(f"[WEBHOOK] SSE push: {sse_status}", flush=True)
    else:
        print(f"[WEBHOOK] No SSE for {payment.id} — polling will detect it", flush=True)

    return {
        "status": "success",
        "message": f"Berhasil memproses {payment.tokens_added} token",
    }


@router.get("/payments/history")
async def api_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    """
    Riwayat pembelian token user (hanya transaksi berstatus 'paid').

    Mendukung pagination via query params:
        ?page=1&page_size=20  (default)
        page_size dibatasi maks 50 untuk mencegah respons terlalu besar.

    Returns:
        List of { id (8-char display), tokens_added, amount, status, created_at }
    """
    page_size = min(max(page_size, 1), 50)  # clamp: 1–50
    offset = (page - 1) * page_size

    payments = (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id, Payment.status == "paid")
        .order_by(Payment.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return [
        {
            "id": p.id[:8],  # Truncate untuk display — bukan untuk lookup
            "tokens_added": p.tokens_added,
            "amount": p.amount,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in payments
    ]


@router.get("/payment/mock-checkout", response_class=HTMLResponse)
async def mock_checkout_page(payment_id: str, package: str, email: str, redirect_url: Optional[str] = "/"):
    pkg = get_package(package) or {"label": package, "price": 0, "tokens": 0}
    pkg_label = pkg["label"]
    amount = pkg["price"]
    tokens = pkg["tokens"]
    amount_str = f"Rp {amount:,}".replace(",", ".")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResearchBuilder — Sandboxed Checkout</title>
    <style>
        :root {{
            --bg-main: #f8fafc; --bg-card: #ffffff; --border-color: #e2e8f0;
            --text-primary: #0f172a; --text-secondary: #475569; --text-muted: #94a3b8;
            --color-primary: #4f46e5; --color-primary-hover: #4338ca; --color-success: #16a34a;
        }}
        @media (prefers-color-scheme: dark) {{
            :root {{
                --bg-main: #09090b; --bg-card: #18181b; --border-color: #27272a;
                --text-primary: #fafafa; --text-secondary: #a1a1aa; --text-muted: #71717a;
            }}
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ background: var(--bg-main); color: var(--text-primary); font-family: system-ui, sans-serif;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }}
        .card {{ width: 100%; max-width: 420px; background: var(--bg-card); border: 1px solid var(--border-color);
                border-radius: 8px; padding: 32px; text-align: center; }}
        .badge {{ display: inline-flex; gap: 6px; background: rgba(79,70,229,0.1); color: var(--color-primary);
                 border: 1px solid rgba(79,70,229,0.2); font-size: 10px; font-weight: 700; padding: 3px 10px;
                 border-radius: 4px; text-transform: uppercase; margin-bottom: 20px; }}
        h2 {{ font-size: 1.25rem; font-weight: 800; margin-bottom: 6px; }}
        .desc {{ color: var(--text-muted); font-size: 0.75rem; margin-bottom: 24px; }}
        .details {{ background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px;
                   padding: 16px; text-align: left; margin-bottom: 24px; font-size: 0.8125rem; }}
        .row {{ display: flex; justify-content: space-between; margin-bottom: 10px; }}
        .row:last-child {{ margin-bottom: 0; padding-top: 10px; border-top: 1px solid var(--border-color); font-weight: 700; }}
        .label {{ color: var(--text-secondary); font-size: 0.75rem; }}
        .value {{ color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }}
        .highlight {{ color: var(--color-primary); font-weight: 700; }}
        .btn {{ width: 100%; background: var(--color-primary); color: #fff; border: none; padding: 10px 16px;
               font-weight: 600; font-size: 0.8125rem; border-radius: 6px; cursor: pointer; }}
        .btn:hover {{ background: var(--color-primary-hover); }}
        .btn-cancel {{ background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border-color); margin-top: 8px; }}
        .status {{ display: none; margin-top: 16px; padding: 10px; border-radius: 6px; font-size: 0.8125rem;
                  background: rgba(22,163,74,0.1); border: 1px solid rgba(22,163,74,0.2); color: var(--color-success); }}
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">Sandbox Mode</span>
        <h2>Simulasi Pembayaran</h2>
        <p class="desc">Gerbang pembayaran tiruan untuk pengujian lokal</p>
        <div class="details">
            <div class="row"><span class="label">Produk</span><span class="value">Token {pkg_label} ({tokens:,} token)</span></div>
            <div class="row"><span class="label">Email</span><span class="value">{email}</span></div>
            <div class="row"><span class="label">ID Transaksi</span><span class="value" style="font-family:monospace;font-size:0.75rem">{payment_id}</span></div>
            <div class="row"><span class="label">Total</span><span class="value highlight">{amount_str}</span></div>
        </div>
        <button id="btn-pay" class="btn">Bayar Sekarang</button>
        <button id="btn-cancel" class="btn btn-cancel" onclick="location.href='{redirect_url}'">Batal</button>
        <div id="status" class="status">Pembayaran Berhasil! Mengalihkan...</div>
    </div>
    <script>
        document.getElementById('btn-pay').addEventListener('click', async function() {{
            this.disabled = true; this.textContent = 'Memproses...';
            try {{
                const r = await fetch('/api/webhook/mayar', {{
                    method: 'POST',
                    headers: {{'Content-Type': 'application/json', 'x-mock-payment': 'true'}},
                    body: JSON.stringify({{event: "payment.success", data: {{paymentId: "{payment_id}", amount: {amount}, customer: {{email: "{email}"}}}}}})
                }});
                if (r.ok) {{ document.getElementById('status').style.display = 'block'; setTimeout(() => location.href = "{redirect_url}", 2000); }}
                else {{ throw new Error('Failed'); }}
            }} catch(e) {{ alert('Gagal: ' + e.message); this.disabled = false; this.textContent = 'Bayar Sekarang'; }}
        }});
    </script>
</body>
</html>"""
    return HTMLResponse(content=html)
