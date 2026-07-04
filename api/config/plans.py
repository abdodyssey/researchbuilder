"""
Token Packages — PAYG Top-Up Configuration
=============================================
Definisi paket token yang tersedia untuk dibeli.
Semua fitur terbuka untuk semua user — gating hanya berdasarkan saldo token.
"""

TOKEN_PACKAGES = {
    "starter": {"tokens": 1000, "price": 1000, "label": "Starter"},
    "standard": {"tokens": 200000, "price": 75000, "label": "Standard"},
    "bulk": {"tokens": 500000, "price": 150000, "label": "Bulk"},
}

FREE_TOKENS = 10000

MAX_REFS = 15
HISTORY_DAYS = -1
TEMPLATE_UPLOAD = True


def get_package(key: str) -> dict | None:
    return TOKEN_PACKAGES.get(key)
