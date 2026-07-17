"""
Agent 1: Topic Narrowing
==========================
Persempit tema umum dari user menjadi fokus penelitian yang spesifik.

Dua fungsi utama:
- run()                    → Untuk batch pipeline: 1 tema → 1 focused topic
- generate_title_options() → Untuk interactive wizard: 1 tema → 3 opsi judul berbeda

Interactive mode: hit Semantic Scholar dulu → temukan research gap/novelty dari
literatur nyata → baru buat 3 judul yang grounded di evidence.
"""

import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import TopicNarrowingInput, TopicNarrowingOutput, TitleOption, TitleOptionsOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm, call_llm_with_usage
from tools.semantic_scholar import search as ss_search
from tools.openalex import search as oa_search
from tools.semantic_scholar import normalize_title

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


# Satu-satunya struktur yang didukung
STRUCTURE_PRESETS = {
    "imrad": "Introduction, Methods, Results, and Discussion (IMRAD)",
    "custom": "Bebas, sesuaikan dengan topik",
}

def _scan_literature(tema: str) -> str:
    """Quick Semantic Scholar scan to ground title generation in real papers.

    Ini hanya pre-scan untuk konteks — bukan literature search utama. Kalau API
    lambat / 429, kita skip cepat (budget retry kecil) agar user tidak menunggu
    lama. LLM tetap bisa buat judul tanpa konteks ini.
    """
    try:
        results = ss_search(tema, max_results=8, max_retries=2, retry_backoff=2.0)
        try:
            oa_results = oa_search(tema, max_results=6, max_retries=2, retry_backoff=2.0)
            seen = {normalize_title(r["title"]) for r in results}
            for r in oa_results:
                if normalize_title(r["title"]) not in seen:
                    results.append(r)
        except Exception:
            pass
        if not results:
            return ""
        lines = []
        for r in results:
            authors = r.get("author", "")
            year = r.get("year", "")
            cite = r.get("citation_count", 0)
            venue = r.get("venue", "")
            fos = ", ".join(r.get("fields_of_study") or [])
            # Utamakan TL;DR (ringkasan 1 kalimat, tajam & hemat token).
            # Fallback ke potongan abstrak kalau TL;DR tidak tersedia.
            summary = (r.get("tldr") or (r.get("snippet") or "")[:200]).strip()
            meta = f"citations: {cite} | venue: {venue}"
            if fos:
                meta += f" | fields: {fos}"
            lines.append(
                f"- [{year}] {r['title']} ({authors}) | {meta}\n  {summary}"
            )
        return "\n".join(lines)
    except Exception:
        return ""


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def generate_title_options(
    tema: str,
    bahasa: str = "id",
    document_type: str = "artikel",
    structure_preset: str = "imrad",
    uploaded_doc_context: str = "",
) -> TitleOptionsOutput:
    """
    Interactive wizard mode: Semantic Scholar scan → LLM generates 3 research-grounded titles.
    Titles are informed by real literature (gaps, trends, citation landscape).
    """
    literature_context = _scan_literature(tema)

    doc_instruction = ""
    if uploaded_doc_context:
        preview = uploaded_doc_context[:8000]
        doc_instruction = f"\n\nDOKUMEN REFERENSI PENGGUNA:\n{preview}"

    structure_desc = STRUCTURE_PRESETS.get(structure_preset, STRUCTURE_PRESETS["imrad"])

    lit_block = ""
    if literature_context:
        lit_block = f"""
LITERATUR TERKINI (Semantic Scholar + OpenAlex) — gunakan untuk identifikasi research gap & novelty:
{literature_context}

Berdasarkan literatur di atas, identifikasi:
1. Apa yang sudah banyak diteliti (saturated areas)
2. Research gap / area yang belum cukup dieksplorasi
3. Peluang novelty untuk penelitian baru
"""

    user_msg = f"""
Tema umum: "{tema}"
Jenis dokumen target: {document_type}
Bahasa output: {bahasa}
Struktur target: {structure_desc}
{lit_block}{doc_instruction}

Berikan 3 opsi judul penelitian yang berbeda. Setiap opsi harus:
- Memiliki sudut pandang/angle yang unik
- Grounded di literatur nyata (jika data literatur tersedia di atas)
- Mengisi research gap yang teridentifikasi

Return JSON:
{{
  "options": [
    {{
      "title": "Judul lengkap artikel",
      "focused_topic": "Fokus spesifik penelitian",
      "description": "Penjelasan singkat: angle penelitian ini + gap yang diisi",
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


