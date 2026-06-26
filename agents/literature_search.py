import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import LiteratureSearchInput, LiteratureSearchOutput
from tools.tavily_search import multi_search
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm

SYSTEM = build_system_prompt("academic research assistant specializing in literature review")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
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
        results_text += f"[{i}] {r['title']}\n{r['snippet'][:300]}\nURL: {r['url']}\n\n"

    results_text = truncate_to_tokens(results_text, 2000)

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Research questions: {inp.research_questions}

Hasil pencarian web:
{results_text}

Pilih maksimal {inp.max_references} hasil paling relevan, beri relevance_score (0.0-1.0), dan tentukan source_type.
Return JSON:
{{
  "references": [
    {{
      "id": "ref_001",
      "title": "...",
      "url": "...",
      "snippet": "...",
      "relevance_score": 0.0,
      "source_type": "journal | conference | report | web"
    }}
  ],
  "search_queries_used": ["..."]
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=2000,
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    data["search_queries_used"] = queries
    return LiteratureSearchOutput(**data)


