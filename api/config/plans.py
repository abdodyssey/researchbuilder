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


def get_package(key: str) -> dict | None:
    return TOKEN_PACKAGES.get(key)
