"""
Token Counter — Estimasi dan Truncation Token
================================================
Utility untuk memperkirakan jumlah token dan memotong teks
agar tidak melebihi context window LLM.

Estimasi kasar: 1 token ≈ 4 karakter (berlaku untuk bahasa Inggris/Indonesia).
Untuk bahasa dengan karakter kompleks, estimasi bisa kurang akurat.

Note: record_usage/get_usage_summary di file ini adalah versi LAMA (deprecated).
Gunakan utils/llm_client.py track_usage() untuk kode baru.
"""


def estimate_tokens(text: str) -> int:
    """Estimasi kasar jumlah token (1 token ≈ 4 karakter)."""
    return len(text) // 4


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """
    Potong teks jika melebihi max_tokens (estimasi).
    Tambahkan marker [truncated] di akhir agar LLM tau ada potongan.
    """
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n... [truncated]"


# ── Legacy usage tracking (deprecated, gunakan llm_client.track_usage) ────────
_usage_log: list[dict] = []

def record_usage(agent: str, prompt_token: int, completion_token: int) -> None:
    """[Deprecated] Catat usage ke in-memory log."""
    _usage_log.append({
        "agent": agent,
        "prompt_token": prompt_token,
        "completion_token": completion_token,
        "total": prompt_token + completion_token
    })

def get_usage_summary() -> dict:
    """[Deprecated] Ambil ringkasan usage dari semua agent."""
    total_prompt = sum(u["prompt_token"] for u in _usage_log)
    total_completion = sum(u["completion_token"] for u in _usage_log)
    return {
        "per_agent": _usage_log,
        "total_prompt": total_prompt,
        "total_completion": total_completion,
        "total": total_prompt + total_completion
    }

