import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import OutlineInput, OutlineOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm

SYSTEM = build_system_prompt("academic writing specialist creating article outlines")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: OutlineInput, template_text: str = "") -> OutlineOutput:
    template_instruction = ""
    if template_text:
        template_instruction = f"\n\nTEMPLATE & STRUKTUR OUTLINE JURNAL TARGET:\n{template_text}\nSesuaikan judul, jumlah section, pembagian bab, dan urutan outline dengan format template target di atas."

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Article type: {inp.article_type}
Bahasa: {inp.bahasa}
Research questions: {inp.research_questions}
Key themes: {inp.key_themes}
Research gaps: {inp.research_gaps}
Synthesis summary: {inp.synthesis_summary[:1000]}
{template_instruction}

Buat outline artikel ilmiah. Return JSON:
{{
  "title": "...",
  "abstract_hint": "...",
  "sections": [
    {{
      "id": "sec_01",
      "title": "...",
      "purpose": "...",
      "key_points": ["...", "..."],
      "word_target": 500,
      "references_to_cite": ["ref_001"]
    }}
  ],
  "estimated_total_words": 3500
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=2000,
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    return OutlineOutput(**data)


