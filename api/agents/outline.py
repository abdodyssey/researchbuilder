"""
Agent 4: Outline Generator — Membuat Kerangka Artikel
======================================================
Membuat outline (kerangka) artikel ilmiah berdasarkan:
- Topik terfokus dari Agent 1
- Sintesis literatur dari Agent 3
- Template jurnal target (opsional)
- Constraints format jurnal (opsional, dari template_parser)

Output: JSON dengan title, abstract_hint, dan list sections
(masing-masing section berisi id, title, purpose, key_points, word_target, references_to_cite).

Fitur:
- Referensi suggestion: setiap section mendapat rekomendasi ref_xxx yang relevan
- Template-aware: jika ada template, outline menyesuaikan struktur jurnal target
- Constraints-aware: mengikuti required_sections, bahasa, tabel/gambar dari JournalConstraints
- Retry otomatis (tenacity): max 2 attempt jika LLM gagal
"""

import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import OutlineInput, OutlineOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm

SYSTEM = build_system_prompt("academic writing specialist creating article outlines")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: OutlineInput, template_text: str = "", constraints=None) -> OutlineOutput:
    """
    Generate outline artikel.

    Args:
        inp: OutlineInput berisi focused_topic, article_type, research_questions,
             key_themes, research_gaps, synthesis_summary, references
        template_text: Teks template jurnal target (opsional, dari file DOCX)
        constraints: JournalConstraints dari template_parser (opsional)

    Returns:
        OutlineOutput: title, abstract_hint, sections[], estimated_total_words
    """
    template_instruction = ""
    if template_text:
        template_instruction = f"\n\nTEMPLATE & STRUKTUR OUTLINE JURNAL TARGET:\n{template_text}\nSesuaikan judul, jumlah section, pembagian bab, dan urutan outline dengan format template target di atas."

    constraints_text = ""
    if constraints:
        constraints_text = f"""
PANDUAN JURNAL TARGET:
- Struktur section wajib: {constraints.required_sections or "bebas"}
- Bahasa: {constraints.language}
- Butuh tabel: {"Ya" if constraints.needs_tables else "Tidak"}
- Butuh gambar: {"Ya (gunakan placeholder [FIGURE: caption])" if constraints.needs_figures else "Tidak"}

Ikuti struktur section wajib dari jurnal jika tersedia.
"""

    ref_list_text = ""
    if hasattr(inp, "references") and inp.references:
        ref_list_text = "\n\nREFERENSI YANG TERSEDIA UNTUK DISITASI:\n" + "\n".join(
            f"- ID: {r.id} | {r.author} ({r.year}) - {r.title}" for r in inp.references
        )

    user_msg = f"""
Focused topic: "{inp.focused_topic}"
Article type: {inp.article_type}
Bahasa: {inp.bahasa}
Research questions: {inp.research_questions}
Key themes: {inp.key_themes}
Research gaps: {inp.research_gaps}
Synthesis summary: {inp.synthesis_summary[:1000]}
{template_instruction}
{constraints_text}
{ref_list_text}

Buat outline artikel ilmiah. Petunjuk pengisian 'references_to_cite': gunakan ID referensi yang tersedia di atas (misal: 'ref_001', 'ref_002') yang paling relevan dengan topik bahasan section tersebut. Jangan gunakan ID yang tidak ada di daftar.

Return JSON:
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
        agent="outline",
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    return OutlineOutput(**data)


