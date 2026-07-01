import os
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("TAVILY_API_KEY", "missing_api_key_on_vercel")
        _client = TavilyClient(api_key=api_key)
    return _client


import re
from urllib.parse import urlparse

def normalize_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        # Ignore scheme (http/https), lowercase host, strip query parameters and trailing slashes
        host = parsed.netloc.lower()
        path = parsed.path.rstrip('/')
        return f"{host}{path}"
    except Exception:
        return url.lower()

def normalize_title(title: str) -> str:
    # Lowercase and keep only alphanumeric characters for comparison
    return re.sub(r'[^a-zA-Z0-9]', '', title).lower()


def search(query: str, max_results: int = 5) -> list[dict]:
    resp = get_client().search(query=query, max_results=max_results)
    results = []
    for r in resp.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", ""),
        })
    return results


def multi_search(queries: list[str], max_per_query: int = 5) -> list[dict]:
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

