
import asyncio
import json
import os
from datetime import datetime, timezone

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
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
   
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.mayar.id/hl/v1/qrcode/create",
            json={
                "amount": amount,
                "name": f"[{payment_id}] Token {label} ResearchBuilder",
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

    return qr_url, (
        data.get("id")
        or data.get("productId")
        or data.get("qrId")
        or data.get("qrcodeId")
        or ""
    )


def _find_matching_payment(db: Session, data: dict) -> Payment | None:

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

    # Lapisan 3: parse internal payment.id dari description/name/message
    # Format: "[{payment.id}] Token {label} ResearchBuilder"
    # Mayar mengirim field ini sebagai 'description', 'productDescription', dll.
    for field_name in ("description", "productDescription", "productName", "name", "message"):
        val = data.get(field_name) or ""
        if isinstance(val, str) and "[" in val and "]" in val:
            try:
                internal_id = val.split("[")[1].split("]")[0].strip()
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
                            f"[WEBHOOK] Matched by field {field_name} containing internal_id={internal_id}",
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

    # Lapisan 5: Fallback pencocokan berdasarkan amount + kedekatan waktu (Sangat penting untuk Dynamic QRIS)
    webhook_amount = data.get("amount") or data.get("paymentLinkAmount")
    if webhook_amount:
        try:
            amount_val = int(webhook_amount)
            pending_payments = (
                db.query(Payment)
                .filter(
                    Payment.status == "pending",
                    Payment.amount == amount_val,
                )
                .all()
            )
            if pending_payments:
                webhook_time_str = data.get("createdAt")
                webhook_time = None
                if webhook_time_str:
                    try:
                        clean_str = webhook_time_str.replace("Z", "+00:00")
                        webhook_time = datetime.fromisoformat(clean_str).replace(tzinfo=None)
                    except Exception:
                        pass
                
                if not webhook_time:
                    webhook_time = datetime.now(timezone.utc).replace(tzinfo=None)

                best_payment = None
                min_diff = None
                for p in pending_payments:
                    if p.created_at:
                        diff = abs((p.created_at - webhook_time).total_seconds())
                        if min_diff is None or diff < min_diff:
                            min_diff = diff
                            best_payment = p

                # Toleransi selisih waktu maksimal 20 menit (1200 detik)
                if best_payment and min_diff < 1200:
                    print(
                        f"[WEBHOOK] Matched by amount fallback. payment_id={best_payment.id} | "
                        f"diff={min_diff:.1f}s | amount={amount_val}",
                        flush=True,
                    )
                    return best_payment
        except Exception as e:
            print(f"[WEBHOOK] Error in amount fallback matching: {e}", flush=True)

    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/payment/create")
async def create_payment_link(
    req: PaymentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pkg = get_package(req.package)
    if not pkg:
        raise HTTPException(status_code=400, detail="Paket tidak valid")

    amount = pkg["price"]
    tokens = pkg["tokens"]
    label = pkg["label"]

    # ── Cek API Key SEBELUM membuat record DB ─────────────────────────────────
    # Penting: jika dicek sesudah INSERT, kegagalan di sini meninggalkan
    # Payment record orphan (status=pending, tidak pernah expire).
    mayar_api_key = os.getenv("MAYAR_API_KEY")
    if not mayar_api_key:
        raise HTTPException(
            status_code=503,
            detail="Sistem pembayaran sedang tidak tersedia saat ini. Silakan hubungi admin.",
        )

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

    # ── Panggil Mayar QRIS API ────────────────────────────────────────────────
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
        # Tandai payment sebagai cancelled agar tidak menumpuk sebagai "pending"
        payment.status = "cancelled"
        db.commit()
        raise
    except Exception as e:
        payment.status = "cancelled"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error membuat QRIS: {str(e)}")


@router.get("/payment/{payment_id}/status")
async def payment_status(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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

    body = await request.body()

    try:
        payload_preview = json.loads(body)
    except Exception:
        payload_preview = {}
    print(
        f"[WEBHOOK] Received — event={payload_preview.get('event')} | body={body.decode('utf-8', errors='ignore')}",
        flush=True,
    )

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

    # ── Idempotency — cek untuk semua status final ────────────────────────────
    if payment.status in ("paid", "cancelled", "expired"):
        print(
            f"[WEBHOOK] {payment.id} already {payment.status.upper()} — skipped (idempotent)",
            flush=True,
        )
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

    elif sse_status == "cancel":
        # Penting: update DB ke "cancelled" agar polling fallback bisa mendeteksi
        # pembatalan tanpa menunggu timer 15 menit di frontend.
        rows = db.execute(
            update(Payment)
            .where(Payment.id == payment.id, Payment.status == "pending")
            .values(status="cancelled")
        ).rowcount
        if rows == 0:
            print(f"[WEBHOOK] Race condition (cancel) on {payment.id} — skipped", flush=True)
            return {"status": "ok", "message": "Already processed"}
        db.commit()
        db.refresh(payment)
        print(
            f"[WEBHOOK] ❌ {payment.id} CANCELLED by gateway (event={event!r})",
            flush=True,
        )

    # ── Push ke SSE (jika client masih terhubung) ─────────────────────────────
    queue = active_connections.get(payment.id)
    if queue:
        await queue.put(sse_status)
        print(f"[WEBHOOK] SSE push: {sse_status}", flush=True)
    else:
        print(f"[WEBHOOK] No SSE for {payment.id} — polling will detect it", flush=True)

    if sse_status == "success":
        return {"status": "success", "message": f"Berhasil menambahkan {payment.tokens_added} token"}
    return {"status": "success", "message": "Pembayaran dibatalkan oleh gateway"}



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
    page_size = min(max(page_size, 1), 50)  # clamp: 1-50
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

