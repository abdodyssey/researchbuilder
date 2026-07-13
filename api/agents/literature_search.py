"""
Agent 2: Literature Search
============================
Mencari literatur akademis menggunakan Semantic Scholar Graph API,
lalu meminta LLM untuk mengevaluasi dan memilih referensi yang paling relevan.

Flow:
  1. Buat beberapa query pencarian dari focused_topic + keywords + research_questions
  2. Jalankan multi_search via Semantic Scholar (deduplicated by judul)
  3. Kirim hasil pencarian + metadata akademik (tahun, sitasi, venue) ke LLM
  4. LLM memilih max N paper terbaik berdasarkan relevansi + kredibilitas
  5. Parse output → bangun list Reference objects (metadata dari data terstruktur)

Output: LiteratureSearchOutput (list of Reference + search_queries_used)
"""

import json

from tenacity import retry, stop_after_attempt, wait_exponential

from schemas.agent_schemas import (
    LiteratureSearchInput,
    LiteratureSearchOutput,
    Reference,
)
from tools.semantic_scholar import multi_search
from utils.llm_client import call_llm
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens

SYSTEM = build_system_prompt(
    "academic research assistant specializing in literature review"
)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2, min=2, max=8))
def run(inp: LiteratureSearchInput) -> LiteratureSearchOutput:
    """
    Jalankan pencarian literatur dan seleksi referensi.

    Langkah:
      1. Buat 3-4 query dari topik + keywords + research questions
      2. Cari via Semantic Scholar (max_per_query=4, dengan abstract + metadata)
      3. Kirim preview hasil ke LLM untuk evaluasi relevansi
      4. LLM pilih max N referensi terbaik beserta metadata
      5. Parse & bangun Reference objects dari hasil seleksi LLM
    """
    # Buat query pencarian dari berbagai angle agar hasil lebih komprehensif
    queries = [
        inp.focused_topic,
        " ".join(inp.keywords[:3]),
        inp.research_questions[0],
    ]
    if len(inp.research_questions) > 1:
        queries.append(inp.research_questions[1])

    # Jalankan pencarian Semantic Scholar (sudah di-deduplikasi oleh judul).
    # Budget retry dibatasi (2×, backoff 2s) + throttle antar-query agar total
    # waktu terkendali walau API publik 429. Tanpa ini, 4 query × retry panjang
    # bisa menyebabkan pencarian menggantung bermenit-menit.
    raw_results = multi_search(
        queries, max_per_query=4, max_retries=2, retry_backoff=2.0, inter_query_delay=1.0
    )

    # Siapkan teks ringkasan hasil untuk dikirim ke LLM.
    # Sertakan metadata akademik (tahun, sitasi, venue) agar LLM bisa menilai
    # relevansi DAN pengaruh/kredibilitas tiap paper, bukan cuma kecocokan teks.
    results_text = ""
    for i, r in enumerate(raw_results):
        content_val = r.get("raw_content") or r.get("snippet", "")
        content_preview = content_val[:3000]
        results_text += (
            f"Index: {i}\n"
            f"Title: {r['title']}\n"
            f"Authors: {r.get('author', 'Anonim')}\n"
            f"Year: {r.get('year', 'n.d.')} | Citations: {r.get('citation_count', 0)} | Venue: {r.get('venue', '-')}\n"
            f"Abstract: {content_preview}\n"
            f"URL: {r['url']}\n\n"
        )

    # Truncate agar tidak melebihi context window LLM
    results_text = truncate_to_tokens(results_text, 6000)

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Research questions: {inp.research_questions}

Hasil pencarian paper akademik (Semantic Scholar):
{results_text}

Pilih maksimal {inp.max_references} paper paling relevan dengan focused topic dan research questions.
Pertimbangkan relevansi tematik DAN kredibilitas (jumlah sitasi & kebaruan tahun).
Untuk setiap paper yang dipilih, tentukan index pencarian dan relevance_score (0.0-1.0).
Metadata penulis, tahun, sitasi, dan venue sudah tersedia di atas — kamu TIDAK perlu menebaknya.

PENTING UNTUK VALIDASI JSON:
1. Output HANYA berupa JSON valid sesuai struktur di bawah. Jangan sertakan teks penjelasan sebelum/sesudahnya.
2. JANGAN PERNAH mengembalikan lebih dari {inp.max_references} referensi di dalam list JSON.

Return JSON dengan format persis seperti ini:
{{
  "selected_references": [
    {{
      "index": 0,
      "relevance_score": 0.9
    }}
  ]
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=1000,
        agent="literature_search",
    )
    raw = raw.strip()
    from utils.llm_client import extract_json

    data = extract_json(raw)

    references = []
    selected = data.get("selected_references", [])
    if not selected and "references" in data:
        # Fallback if LLM outputted "references" instead of "selected_references"
        selected = data["references"]

    for item in selected:
        idx = item.get("index")
        # Try to parse index if it is a string
        if isinstance(idx, str) and idx.isdigit():
            idx = int(idx)

        if idx is not None and 0 <= idx < len(raw_results):
            orig = raw_results[idx]
            ref_id = f"ref_{len(references) + 1:03d}"
            references.append(
                Reference(
                    id=ref_id,
                    title=orig.get("title", "Judul tidak ditemukan"),
                    url=orig.get("url", ""),
                    snippet=orig.get("snippet", ""),
                    raw_content=orig.get("raw_content", ""),
                    relevance_score=float(item.get("relevance_score", 0.0) or 0.0),
                    source_type=orig.get("source_type", "journal"),
                    author=orig.get("author", "Anonim"),
                    year=str(orig.get("year", "n.d.")),
                    citation_count=int(orig.get("citation_count", 0) or 0),
                    venue=orig.get("venue", ""),
                )
            )

    return LiteratureSearchOutput(references=references, search_queries_used=queries)
