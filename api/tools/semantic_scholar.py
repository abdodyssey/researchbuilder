"""
Semantic Scholar Search — Academic Paper Search Integration
============================================================
Wrapper untuk Semantic Scholar Graph API (https://api.semanticscholar.org).

Menggantikan Tavily (web search umum) dengan pencarian paper akademik asli.
Dipakai oleh Agent 2 (Literature Search) untuk mencari literatur ilmiah.

Kenapa Semantic Scholar untuk MVP ini:
- Hasil = paper akademik beneran (bukan halaman web acak) → abstract, tahun,
  penulis, jumlah sitasi, venue. Ini yang bikin analisis research gap & novelty
  jadi *grounded* (LLM tahu paper mana yang berpengaruh & terbaru).
- Gratis tanpa API key untuk volume kecil (shared rate-limit pool). Kalau perlu
  kuota lebih tinggi, set SEMANTIC_SCHOLAR_API_KEY → dikirim via header x-api-key.
- Tanpa dependency baru: pakai httpx yang sudah ada di requirements.

Fitur:
- Lazy config (import tidak crash tanpa env)
- multi_search: beberapa query sekaligus, hasil digabung & dedup (paperId + judul)
- Signature kompatibel dengan tools/tavily_search.py lama agar agent minim diubah:
  tiap hasil punya key: title, url, snippet, raw_content (+ metadata akademik).
"""

import os
import re
import time

import httpx
from config.settings import settings

API_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

# Field yang diminta dari Semantic Scholar Graph API.
# tldr = ringkasan 1 kalimat AI-generated (umpan tajam & hemat token untuk LLM).
# fieldsOfStudy = bidang ilmu (bantu LLM identifikasi angle & gap antar-disiplin).
FIELDS = "title,abstract,tldr,fieldsOfStudy,year,authors,citationCount,venue,url,externalIds,publicationTypes"

# Timeout & retry ringan (API publik kadang lambat / 429 rate limit).
# Tanpa API key, Semantic Scholar memakai shared pool yang sering 429 —
# backoff dibuat cukup panjang agar tahan kongesti. Untuk produksi dengan
# banyak user, set SEMANTIC_SCHOLAR_API_KEY (gratis) agar kuota jauh lebih tinggi.
_TIMEOUT = 20.0
_MAX_RETRIES = 5
_RETRY_BACKOFF = 4.0  # detik; dikali (attempt+1) untuk 429


def _headers() -> dict:
    """Header request. Sertakan x-api-key hanya jika env tersedia."""
    headers = {"User-Agent": "ResearchBuilder/1.0"}
    api_key = settings.SEMANTIC_SCHOLAR_API_KEY
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def normalize_title(title: str) -> str:
    """Normalisasi judul untuk deduplication: hanya alphanumeric lowercase."""
    return re.sub(r"[^a-zA-Z0-9]", "", title or "").lower()


def _format_authors(authors: list[dict]) -> str:
    """Ubah list author dari API jadi string 'Nama; Nama; ...'."""
    names = [a.get("name", "").strip() for a in (authors or []) if a.get("name")]
    return "; ".join(names) if names else "Anonim"


def search(query: str, max_results: int = 5, max_retries: int | None = None, retry_backoff: float | None = None) -> list[dict]:
    """
    Jalankan satu query pencarian ke Semantic Scholar.
    Mengembalikan list dict dengan bentuk yang kompatibel dengan tool lama
    (title/url/snippet/raw_content) plus metadata akademik.

    max_retries/retry_backoff: override budget retry default. Path interaktif
    (mis. pre-scan judul) memakai budget kecil agar UI tetap responsif —
    kalau 429, lebih baik skip daripada bikin user nunggu 60 detik.
    """
    retries = _MAX_RETRIES if max_retries is None else max_retries
    backoff = _RETRY_BACKOFF if retry_backoff is None else retry_backoff

    params = {
        "query": query,
        "limit": max_results,
        "fields": FIELDS,
    }

    data = None
    for attempt in range(retries):
        try:
            resp = httpx.get(
                API_URL, params=params, headers=_headers(), timeout=_TIMEOUT
            )
            if resp.status_code == 429:
                # Rate limited — backoff lalu coba lagi.
                time.sleep(backoff * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except (httpx.HTTPError, ValueError):
            if attempt == retries - 1:
                return []
            time.sleep(1.5 * (attempt + 1))

    if not data:
        return []

    results = []
    for p in data.get("data", []) or []:
        abstract = p.get("abstract") or ""
        ext = p.get("externalIds") or {}
        doi = ext.get("DOI")
        url = p.get("url") or (f"https://doi.org/{doi}" if doi else "")
        pub_types = p.get("publicationTypes") or []
        tldr_obj = p.get("tldr") or {}
        tldr = tldr_obj.get("text") if isinstance(tldr_obj, dict) else ""
        fields_of_study = p.get("fieldsOfStudy") or []
        results.append({
            "title": p.get("title", "") or "",
            "url": url,
            "snippet": abstract[:500],
            "raw_content": abstract,
            # Metadata akademik — dipakai untuk analisis gap/novelty:
            "tldr": tldr or "",
            "fields_of_study": fields_of_study,
            "author": _format_authors(p.get("authors")),
            "year": str(p.get("year")) if p.get("year") else "n.d.",
            "citation_count": int(p.get("citationCount") or 0),
            "venue": p.get("venue") or "",
            "source_type": (pub_types[0].lower() if pub_types else "journal"),
        })
    return results


def multi_search(
    queries: list[str],
    max_per_query: int = 5,
    max_retries: int | None = None,
    retry_backoff: float | None = None,
    inter_query_delay: float = 1.0,
) -> list[dict]:
    """
    Jalankan beberapa query dan gabungkan hasil (deduplicated).
    Dedup berdasarkan judul yang dinormalisasi.

    inter_query_delay: jeda antar-query (throttle) agar tidak menembak API
    publik terlalu cepat → mengurangi 429. Tanpa API key, Semantic Scholar
    memakai shared pool; throttle ringan jauh menurunkan rate-limit.
    max_retries/retry_backoff: budget retry per query (diteruskan ke search()).
    """
    seen_titles = set()
    all_results = []
    for i, q in enumerate(queries):
        if not q or not q.strip():
            continue
        if i > 0 and inter_query_delay > 0:
            time.sleep(inter_query_delay)
        for r in search(q, max_per_query, max_retries=max_retries, retry_backoff=retry_backoff):
            norm_title = normalize_title(r["title"])
            if norm_title and norm_title not in seen_titles:
                seen_titles.add(norm_title)
                all_results.append(r)
    return all_results
