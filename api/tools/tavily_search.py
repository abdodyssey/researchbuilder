"""
Tavily Search — Web Search Integration
=========================================
Wrapper untuk Tavily API (web search engine untuk AI agents).

Digunakan oleh Agent 2 (Literature Search) untuk mencari literatur akademis.

Fitur:
- Lazy client init (supaya import di Vercel tidak crash tanpa API key)
- Advanced search depth + raw_content (full text dari halaman web)
- Deduplication: URL normalization + title normalization mencegah duplikat
- multi_search: jalankan beberapa query sekaligus, gabungkan hasilnya
"""

import os
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

# Lazy-initialized Tavily client (singleton pattern, sama seperti Groq client)
_client = None

def get_client():
    """Inisialisasi Tavily client hanya saat pertama dipanggil."""
    global _client
    if _client is None:
        api_key = os.getenv("TAVILY_API_KEY", "missing_api_key_on_vercel")
        _client = TavilyClient(api_key=api_key)
    return _client


import re
from urllib.parse import urlparse

def normalize_url(url: str) -> str:
    """Normalisasi URL untuk deduplication: lowercase host, strip query params."""
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.rstrip('/')
        return f"{host}{path}"
    except Exception:
        return url.lower()

def normalize_title(title: str) -> str:
    """Normalisasi judul untuk deduplication: hanya alphanumeric lowercase."""
    return re.sub(r'[^a-zA-Z0-9]', '', title).lower()


def search(query: str, max_results: int = 5) -> list[dict]:
    """
    Jalankan satu query pencarian Tavily.
    Menggunakan advanced search depth + include_raw_content untuk full text.
    """
    resp = get_client().search(
        query=query, 
        max_results=max_results,
        search_depth="advanced",
        include_raw_content=True
    )
    results = []
    for r in resp.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
            "raw_content": r.get("raw_content", ""),
        })
    return results


def multi_search(queries: list[str], max_per_query: int = 5) -> list[dict]:
    """
    Jalankan beberapa query pencarian dan gabungkan hasilnya (deduplicated).
    Dedup berdasarkan URL yang dinormalisasi DAN judul yang dinormalisasi.
    """
    seen_urls = set()
    seen_titles = set()
    all_results = []
    for q in queries:
        for r in search(q, max_per_query):
            norm_url = normalize_url(r["url"])
            norm_title = normalize_title(r["title"])
            
            if norm_url not in seen_urls and norm_title not in seen_titles:
                seen_urls.add(norm_url)
                seen_titles.add(norm_title)
                all_results.append(r)
    return all_results

