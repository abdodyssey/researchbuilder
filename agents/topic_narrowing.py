import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import TopicNarrowingInput, TopicNarrowingOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm

SYSTEM = build_system_prompt("senior academic researcher specializing in topic scoping")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: TopicNarrowingInput, template_text: str = "") -> TopicNarrowingOutput:
    template_instruction = ""
    if template_text:
        template_instruction = f"\n\nTEMPLATE & PEDOMAN PENULISAN TARGET:\n{template_text}\nSesuaikan fokus topik dan tipe artikel agar selaras dengan panduan penulisan di atas."

    user_msg = f"""
Tema umum: "{inp.tema_umum}"
Bahasa output artikel: {inp.bahasa}
{template_instruction}

Persempit tema ini menjadi fokus penelitian yang spesifik.
Return JSON dengan struktur:
{{
  "focused_topic": "...",
  "research_questions": ["...", "..."],
  "keywords": ["...", "..."],
  "article_type": "literature_review | empirical | conceptual",
  "suggested_title": "..."
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=1000,
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    return TopicNarrowingOutput(**data)


