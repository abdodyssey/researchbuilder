import json

from tenacity import retry, stop_after_attempt, wait_exponential

from schemas.agent_schemas import LiteratureSearchInput, LiteratureSearchOutput, Reference
from tools.tavily_search import multi_search
from utils.llm_client import call_llm
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens

SYSTEM = build_system_prompt(
    "academic research assistant specializing in literature review"
)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=15))
def run(inp: LiteratureSearchInput) -> LiteratureSearchOutput:
    queries = [
        inp.focused_topic,
        " ".join(inp.keywords[:3]),
        inp.research_questions[0],
    ]
    if len(inp.research_questions) > 1:
        queries.append(inp.research_questions[1])

    raw_results = multi_search(queries, max_per_query=4)

    results_text = ""
    for i, r in enumerate(raw_results):
        results_text += f"Index: {i}\nTitle: {r['title']}\nSnippet: {r['snippet'][:250]}\nURL: {r['url']}\n\n"

    results_text = truncate_to_tokens(results_text, 1500)

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Research questions: {inp.research_questions}

Hasil pencarian web:
{results_text}

Pilih maksimal {inp.max_references} hasil paling relevan. Untuk setiap hasil yang dipilih, tentukan index pencarian, relevance_score (0.0-1.0), source_type, author, dan year.

PENTING UNTUK VALIDASI JSON:
1. Pastikan output HANYA berupa JSON valid sesuai dengan struktur di bawah. Jangan sertakan teks penjelasan sebelum atau sesudahnya.
2. JANGAN PERNAH mengembalikan lebih dari {inp.max_references} referensi di dalam list JSON.

Return JSON dengan format persis seperti ini:
{{
  "selected_references": [
    {{
      "index": 0,
      "relevance_score": 0.9,
      "source_type": "journal | conference | report | web",
      "author": "Nama penulis dipisahkan titik koma (;), jika tidak ada gunakan 'Anonim'",
      "year": "Tahun terbit, jika tidak ada gunakan 'n.d.'"
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
            references.append(Reference(
                id=ref_id,
                title=orig.get("title", "Judul tidak ditemukan"),
                url=orig.get("url", ""),
                snippet=orig.get("snippet", ""),
                relevance_score=float(item.get("relevance_score", 0.0) or 0.0),
                source_type=item.get("source_type", "web"),
                author=item.get("author", "Anonim"),
                year=str(item.get("year", "n.d."))
            ))

    return LiteratureSearchOutput(
        references=references,
        search_queries_used=queries
    )
