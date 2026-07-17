"""
OpenAlex Search — Academic Paper Search via OpenAlex API
=========================================================
Free, open academic search API (no API key required).
Provides an `mailto` parameter for the "polite pool" (higher rate limits).

Same interface as semantic_scholar.py for easy integration:
each result has: title, url, snippet, raw_content + academic metadata.
"""

import re
import time

import httpx
from config.settings import settings

API_URL = "https://api.openalex.org/works"

_TIMEOUT = 20.0
_MAX_RETRIES = 3
_RETRY_BACKOFF = 2.0


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", title or "").lower()


def _format_authors(authorships: list[dict]) -> str:
    names = []
    for a in (authorships or []):
        author = a.get("author", {})
        name = author.get("display_name", "").strip()
        if name:
            names.append(name)
    return "; ".join(names) if names else "Anonim"


def _get_venue(result: dict) -> str:
    loc = result.get("primary_location") or {}
    source = loc.get("source") or {}
    return source.get("display_name") or ""


def _get_doi_url(result: dict) -> str:
    doi = result.get("doi") or ""
    if doi:
        return doi if doi.startswith("http") else f"https://doi.org/{doi}"
    landing = (result.get("primary_location") or {}).get("landing_page_url") or ""
    return landing or result.get("id", "")


def _params(mailto: str | None, api_key: str | None) -> dict:
    p = {}
    if mailto:
        p["mailto"] = mailto
    if api_key:
        p["api_key"] = api_key
    return p


def search(
    query: str,
    max_results: int = 5,
    max_retries: int | None = None,
    retry_backoff: float | None = None,
) -> list[dict]:
    retries = _MAX_RETRIES if max_retries is None else max_retries
    backoff = _RETRY_BACKOFF if retry_backoff is None else retry_backoff

    mailto = getattr(settings, "OPENALEX_EMAIL", None) or None
    api_key = getattr(settings, "OPENALEX_API_KEY", None) or None

    params = {
        "search": query,
        "per_page": max_results,
        "select": "id,doi,title,authorships,publication_year,cited_by_count,primary_location,abstract_inverted_index,type",
        **_params(mailto, api_key),
    }

    data = None
    for attempt in range(retries):
        try:
            resp = httpx.get(API_URL, params=params, timeout=_TIMEOUT)
            if resp.status_code == 429:
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
    for work in data.get("results", []) or []:
        abstract = _reconstruct_abstract(work.get("abstract_inverted_index"))
        title = work.get("title") or ""
        url = _get_doi_url(work)
        venue = _get_venue(work)

        results.append({
            "title": title,
            "url": url,
            "snippet": abstract[:500],
            "raw_content": abstract,
            "tldr": "",
            "fields_of_study": [],
            "author": _format_authors(work.get("authorships")),
            "year": str(work.get("publication_year")) if work.get("publication_year") else "n.d.",
            "citation_count": int(work.get("cited_by_count") or 0),
            "venue": venue,
            "source_type": (work.get("type") or "journal").replace("-", " "),
        })
    return results


def _reconstruct_abstract(inverted_index: dict | None) -> str:
    if not inverted_index:
        return ""
    word_positions = []
    for word, positions in inverted_index.items():
        for pos in positions:
            word_positions.append((pos, word))
    word_positions.sort(key=lambda x: x[0])
    return " ".join(w for _, w in word_positions)


def multi_search(
    queries: list[str],
    max_per_query: int = 5,
    max_retries: int | None = None,
    retry_backoff: float | None = None,
    inter_query_delay: float = 1.0,
) -> list[dict]:
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
