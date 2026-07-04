"""
Agent 3: Synthesis
====================
Sintesis temuan dari literatur yang telah dikumpulkan.

Tugas utama:
- Identifikasi tema-tema kunci (key_themes) yang muncul lintas pustaka
- Identifikasi celah penelitian (research_gaps) beserta rencana pengisian
- Ekstrak temuan kunci (key_findings) dengan referensi pendukung
- Tulis ringkasan sintesis + positioning statement

Input: focused_topic + research_questions + list of Reference
Output: SynthesisOutput (themes, gaps, findings, summary, positioning)
"""

import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import SynthesisInput, SynthesisOutput
from utils.prompt_builder import build_system_prompt, refs_to_text
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm

SYSTEM = build_system_prompt("academic researcher synthesizing literature findings")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: SynthesisInput) -> SynthesisOutput:
    """
    Jalankan sintesis pustaka: identifikasi tema, gap, temuan kunci.
    Referensi di-truncate ke 1500 token agar muat di context window LLM.
    """
    refs_text = refs_to_text([r.model_dump() for r in inp.references])
    refs_text = truncate_to_tokens(refs_text, 1500)

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Research questions: {inp.research_questions}

Referensi:
{refs_text}

Sintesis referensi di atas. Return JSON:
{{
  "key_themes": [
    {{
      "theme_name": "Nama Tema Utama",
      "synthesis": "Penjelasan singkat bagaimana tema ini dibahas lintas pustaka",
      "references_ids": ["ref_001", "ref_002"]
    }}
  ],
  "research_gaps": [
    {{
      "gap_description": "Penjelasan celah penelitian yang ditemukan",
      "how_we_address_it": "Bagaimana penelitian kita akan mengisi celah tersebut"
    }}
  ],
  "key_findings": [
    {{"finding": "...", "supported_by": ["ref_001"]}}
  ],
  "synthesis_summary": "...(max 500 kata)",
  "positioning_statement": "..."
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=2000,
        agent="synthesis",
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    return SynthesisOutput(**data)


