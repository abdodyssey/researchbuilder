"""
Agent 1: Topic Narrowing
==========================
Persempit tema umum dari user menjadi fokus penelitian yang spesifik.

Dua fungsi utama:
- run()                    → Untuk batch pipeline: 1 tema → 1 focused topic
- generate_title_options() → Untuk interactive wizard: 1 tema → 3 opsi judul berbeda

Output mencakup: focused_topic, research_questions, keywords, article_type, suggested_title.
LLM diminta mengembalikan JSON yang langsung diparsing ke Pydantic model.
"""

import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import TopicNarrowingInput, TopicNarrowingOutput, TitleOption, TitleOptionsOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm, call_llm_with_usage

SYSTEM = build_system_prompt("senior academic researcher specializing in topic scoping")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: TopicNarrowingInput, template_text: str = "") -> TopicNarrowingOutput:
    """
    Batch mode: persempit 1 tema → 1 focused topic + metadata penelitian.
    Jika template_text diberikan, LLM akan menyesuaikan angle topik dengan pedoman jurnal.
    """
    template_instruction = ""
    if template_text:
        template_instruction = f"\n\nTEMPLATE & PEDOMAN PENULISAN TARGET:\n{template_text}\nSesuaikan fokus topik dan tipe artikel agar selaras dengan panduan penulisan di atas."

    user_msg = f"""
Tema umum: "{inp.tema_umum}"
Jenis dokumen target: {inp.document_type}
Bahasa output artikel: {inp.bahasa}
{template_instruction}

Persempit tema ini menjadi fokus penelitian yang spesifik untuk jenis dokumen {inp.document_type}.
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
        agent="topic_narrowing",
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    return TopicNarrowingOutput(**data)


# Preset struktur artikel: digunakan di prompt agar LLM paham format target
STRUCTURE_PRESETS = {
    "imrad": "Introduction, Methods, Results, and Discussion (IMRAD)",
    "skripsi": "Pendahuluan, Tinjauan Pustaka, Metodologi, Hasil & Pembahasan, Kesimpulan",
    "custom": "Bebas, sesuaikan dengan topik",
}

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def generate_title_options(
    tema: str,
    bahasa: str = "id",
    document_type: str = "artikel",
    structure_preset: str = "imrad",
    uploaded_doc_context: str = "",
) -> TitleOptionsOutput:
    """
    Interactive wizard mode: berikan 3 opsi judul penelitian yang berbeda.
    Setiap opsi punya angle/perspektif unik (misal: systematic review vs empirical vs conceptual).

    Jika uploaded_doc_context ada (user upload PDF/DOCX sebagai referensi),
    LLM akan menggunakan isi dokumen tersebut untuk menyarankan judul yang lebih relevan.
    """
    doc_instruction = ""
    if uploaded_doc_context:
        preview = uploaded_doc_context[:8000]
        doc_instruction = f"\n\nDOKUMEN REFERENSI PENGGUNA (gunakan sebagai konteks untuk menyarankan judul yang relevan):\n{preview}"

    structure_desc = STRUCTURE_PRESETS.get(structure_preset, STRUCTURE_PRESETS["imrad"])

    user_msg = f"""
Tema umum: "{tema}"
Jenis dokumen target: {document_type}
Bahasa output: {bahasa}
Struktur target: {structure_desc}
{doc_instruction}

Berikan 3 opsi judul penelitian yang berbeda untuk tema di atas. Setiap opsi harus memiliki sudut pandang/angle yang unik.

Return JSON:
{{
  "options": [
    {{
      "title": "Judul lengkap artikel",
      "focused_topic": "Fokus spesifik penelitian",
      "description": "Penjelasan singkat 1-2 kalimat tentang angle penelitian ini",
      "research_questions": ["Pertanyaan penelitian 1", "Pertanyaan penelitian 2"],
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "article_type": "literature_review | empirical | conceptual"
    }},
    {{...}},
    {{...}}
  ]
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.5,
        max_tokens=2000,
        agent="title_generation",
    )
    raw = raw.strip()
    from utils.llm_client import extract_json
    data = extract_json(raw)
    options = [TitleOption(**opt) for opt in data.get("options", [])]
    return TitleOptionsOutput(options=options[:3])


