"""
Email Sender — Transactional email via Resend
==============================================
Wrapper tipis untuk kirim email transaksional (verifikasi akun) via Resend API.

Kenapa Resend:
- Deliverability tinggi (DKIM/SPF/DMARC otomatis saat domain diverifikasi) →
  email masuk INBOX, bukan spam. Ini alasan utama dipilih vs SMTP Gmail personal
  yang sering ditandai spam oleh penerima.
- HTTP API sederhana (pakai httpx yang sudah ada, tanpa dependency SMTP).
- Free tier 3.000 email/bulan — cukup untuk MVP.

Konfigurasi (.env):
    RESEND_API_KEY   = re_xxx           (wajib; tanpa ini email di-skip & di-log)
    EMAIL_FROM       = "ResearchBuilder <noreply@domainmu.com>"
    APP_BASE_URL     = https://app.domainmu.com   (untuk membangun magic link)

Mode dev tanpa RESEND_API_KEY:
    Email tidak dikirim — magic link dicetak ke stdout agar bisa dites lokal.
"""

import os

import httpx

RESEND_API_URL = "https://api.resend.com/emails"


def _config() -> tuple[str | None, str, str]:
    api_key = os.getenv("RESEND_API_KEY")
    email_from = os.getenv("EMAIL_FROM", "ResearchBuilder <onboarding@resend.dev>")
    app_base_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
    return api_key, email_from, app_base_url


def send_verification_email(to_email: str, full_name: str, token: str) -> bool:
    """
    Kirim email verifikasi berisi magic link.

    Returns:
        True jika terkirim (atau di-log di mode dev), False jika gagal.
    """
    api_key, email_from, app_base_url = _config()
    verify_url = f"{app_base_url}/verify?token={token}"
    name = full_name or "Peneliti"

    # Mode dev: tanpa API key, cetak link ke konsol agar tetap bisa dites.
    if not api_key:
        print(
            f"\n[EMAIL DEV MODE] Verifikasi untuk {to_email}:\n  {verify_url}\n",
            flush=True,
        )
        return True

    html = _verification_html(name, verify_url)
    try:
        resp = httpx.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": email_from,
                "to": [to_email],
                "subject": "Verifikasi akun ResearchBuilder Anda",
                "html": html,
            },
            timeout=15.0,
        )
        if resp.status_code >= 400:
            print(f"[EMAIL] Resend error {resp.status_code}: {resp.text}", flush=True)
            return False
        print(f"[EMAIL] Verifikasi terkirim ke {to_email}", flush=True)
        return True
    except Exception as e:
        print(f"[EMAIL] Gagal kirim ke {to_email}: {e}", flush=True)
        return False


def _verification_html(name: str, verify_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
    <div style="padding:32px 32px 24px;">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#18181b;">Verifikasi akun Anda</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
        Halo {name}, terima kasih sudah mendaftar di <strong>ResearchBuilder</strong>.
        Klik tombol di bawah untuk mengaktifkan akun Anda.
      </p>
      <a href="{verify_url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">
        Verifikasi Email
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
        Atau salin tautan ini ke browser Anda:<br>
        <span style="color:#71717a;word-break:break-all;">{verify_url}</span>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
        Tautan berlaku selama 24 jam. Abaikan email ini jika Anda tidak mendaftar.
      </p>
    </div>
  </div>
</body>
</html>"""
