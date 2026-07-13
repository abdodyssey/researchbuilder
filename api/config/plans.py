"""
Token Packages — PAYG Top-Up Configuration
=============================================
Definisi paket token yang tersedia untuk dibeli.
Semua fitur terbuka untuk semua user — gating hanya berdasarkan saldo token.
"""

TOKEN_PACKAGES = {
    #                  tokens   price (IDR)   price/1k tokens
    "starter":  {"tokens":  50_000, "price":  15_000, "label": "Starter"},   # Rp 300 / 1k token
    "standard": {"tokens": 200_000, "price":  50_000, "label": "Standard"},  # Rp 250 / 1k token  ← terpopuler
    "bulk":     {"tokens": 600_000, "price": 120_000, "label": "Bulk"},      # Rp 200 / 1k token  ← terbaik
}

FREE_TOKENS = 10000

MAX_REFS = 15
HISTORY_DAYS = -1
TEMPLATE_UPLOAD = True

# Estimasi token minimum yang wajib tersedia SEBELUM tiap operasi dimulai.
# Guard ini mencegah user memulai proses yang pasti gagal/mengering di tengah
# jalan (mis. sisa 500 token tapi penulisan artikel butuh puluhan ribu).
# Angka konservatif berdasarkan pemakaian tipikal Groq llama-3.3-70b.
TOKEN_COST = {
    "titles": 3_000,        # scan literatur + generate 3 judul
    "literature": 20_000,   # literature search + synthesis + outline (banyak paper)
    "writing": 25_000,      # penulisan semua bab + review + export
}
# Fallback minimum kalau nama operasi tidak dikenal.
MIN_TOKENS_PER_OP = 3_000


def get_package(key: str) -> dict | None:
    return TOKEN_PACKAGES.get(key)
