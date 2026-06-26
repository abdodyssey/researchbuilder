import json
import re
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import ReviewInput, ReviewOutput
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("peer reviewer for academic journals")



@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: ReviewInput, article_type: str = "literature_review", template_text: str = "") -> ReviewOutput:
    draft_text = truncate_to_tokens(inp.full_draft, 1200)
    
    # Determine constraints based on article_type
    methodology_constraint = ""
    if article_type == "literature_review":
        methodology_constraint = (
            "- DILARANG KERAS mengklaim atau mengarang adanya metode survei empiris, kuesioner, wawancara, atau pengujian langsung dalam abstrak "
            "karena tipe artikel ini adalah LITERATURE REVIEW (Tinjauan Literatur). Abstrak harus secara realistis menjelaskan bahwa artikel "
            "merupakan studi tinjauan pustaka/sintesis literatur."
        )
    elif article_type == "conceptual":
        methodology_constraint = (
            "- DILARANG KERAS mengklaim adanya pengujian empiris fiktif, survei, atau kuesioner dalam abstrak karena tipe artikel ini adalah "
            "CONCEPTUAL (Konseptual). Abstrak harus menjelaskan analisis konsep dan teoretis secara logis."
        )
        
    template_instruction = ""
    if template_text:
        template_instruction = f"\n- GAYA & OUTLINE PENULISAN TARGET: Sesuaikan gaya ringkasan dan format abstrak dengan panduan berikut jika ada:\n{template_text}"

    user_msg = f"""
Review artikel ilmiah berikut sebagai peer reviewer jurnal.
Topik: "{inp.focused_topic}"
Tipe Artikel: {article_type}
Research questions: {inp.research_questions}
Draft:
{draft_text}

ATURAN PEMBUATAN ABSTRAK (WAJIB DIPATUHI):
{methodology_constraint}
- Abstrak harus substantif (minimal 150 kata) dengan struktur lengkap: latar belakang (background), tujuan (objective), metode (methods), hasil/temuan (findings), dan kesimpulan (conclusion).
- Tulis abstrak secara jujur dan akurat sesuai dengan isi draft di atas. Jangan mengarang data atau metode yang tidak ada di dalam draft.{template_instruction}

Balas HANYA dengan JSON valid, tanpa teks lain:
{{
  "overall_score": 60,
  "issues": [
    {{
      "type": "coherence",
      "location": "Pendahuluan",
      "description": "...",
      "suggestion": "...",
      "severity": "minor"
    }}
  ],
  "abstract": "tulis abstrak substantif minimal 150 kata dengan struktur lengkap: latar belakang (background), tujuan (objective), metode (methods), hasil/temuan (findings), dan kesimpulan (conclusion)",
  "keywords_final": ["keyword1", "keyword2"],
  "review_summary": "..."
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
    
    try:
        data = extract_json(raw)
    except Exception as e:
        print(f"[ERROR] Failed to parse JSON response from Review Agent: {e}")
        print(f"[DEBUG] Raw response from Groq was:\n{raw}")
        raise
        
    return ReviewOutput(**data)

