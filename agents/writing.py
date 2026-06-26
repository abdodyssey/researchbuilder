import json
import re
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import WritingInput, WritingOutput, WritingSectionOutput
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("academic writer producing formal research article sections")


def refs_to_citation_list(references) -> str:
    """Format referensi sebagai numbered list dengan ID eksplisit."""
    lines = []
    for r in references:
        ref = r.model_dump() if hasattr(r, "model_dump") else r
        lines.append(
            f"ID: {ref['id']}\n"
            f"Judul: {ref['title']}\n"
            f"Snippet: {ref['snippet'][:200]}"
        )
    return "\n\n".join(lines)

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def write_section(inp: WritingInput, template_text: str = "") -> WritingSectionOutput:
    refs_text = refs_to_citation_list(inp.references_detail)
    refs_text = truncate_to_tokens(refs_text, 1000)

    # Cek apakah section ini adalah Metodologi
    is_methodology = any(x in inp.section.title.lower() for x in ["method", "metode", "metodologi"])
    methodology_instruction = ""
    if is_methodology:
        methodology_instruction = """
KHUSUS UNTUK METODOLOGI PENELITIAN:
- DILARANG KERAS mengarang eksperimen empiris fiktif, kuesioner fiktif, wawancara fiktif, atau pengumpulan data lapangan fiktif yang tidak benar-benar dilakukan.
- Jelaskan metode penelitian secara realistis sebagai studi berbasis literatur (literature review), analisis data sekunder, studi komparatif literatur, atau sintesis konseptual berdasarkan referensi yang tersedia.
- Rincikan langkah-langkah pencarian, penyaringan, dan pengelompokan literatur secara sistematis."""

    user_msg = f"""Tulis section artikel ilmiah dalam bahasa {inp.context.bahasa}.

ATURAN SITASI — WAJIB DIIKUTI:
- Gunakan HANYA referensi yang ada di daftar bawah
- Format sitasi: gunakan ID referensi dalam kurung siku, contoh: [ref_001], [ref_003]
- DILARANG KERAS mengarang nama author atau tahun yang tidak ada di daftar referensi
- Jika tidak ada referensi yang cocok untuk suatu klaim, tulis tanpa sitasi

ATURAN PENULISAN:
- Fokus HANYA pada tujuan section: {inp.section.purpose}
- Jangan ulangi ide dari section lain
- Gaya: akademik, objektif, mengalir dalam paragraf
- Target: {inp.section.word_target} kata (toleransi ±20%)
- HINDARI KALIMAT FILLER ATAU PENGULANGAN TEMPLATE di akhir/awal section (seperti "Dengan demikian, penelitian ini berkontribusi...", "Diharapkan penelitian ini...", dll.). Tulisan harus mengalir secara profesional menyambung ke bagian berikutnya.{methodology_instruction}
- GAYA PENULISAN TARGET: Sesuaikan gaya, nada, dan layout penulisan dengan pedoman template target berikut jika ada:
{template_text}

Section: "{inp.section.title}"
Poin yang harus dibahas:
{chr(10).join(f"- {p}" for p in inp.section.key_points)}

DAFTAR REFERENSI VALID:
{refs_text}

Konteks:
- Topik: {inp.context.focused_topic}
- Tipe: {inp.context.article_type}
- Positioning: {inp.context.positioning_statement}

Balas HANYA JSON valid:
{{
  "section_id": "{inp.section.id}",
  "title": "{inp.section.title}",
  "content": "isi section dalam paragraf markdown",
  "word_count": 0,
  "citations_used": ["ref_001"]
}}"""

    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=2000,
    )
    data = extract_json(raw)
    data["word_count"] = len(data.get("content", "").split())
    return WritingSectionOutput(**data)


def run(sections, context, references_detail, template_text: str = "") -> WritingOutput:
    results = []
    for section in sections:
        inp = WritingInput(
            section=section,
            context=context,
            references_detail=references_detail,
        )
        try:
            result = write_section(inp, template_text)
        except Exception as e:
            result = WritingSectionOutput(
                section_id=section.id,
                title=section.title,
                content=f"[ERROR: {str(e)}]\n\n" + "\n".join(f"- {p}" for p in section.key_points),
                word_count=0,
                citations_used=[],
            )
        results.append(result)
    return WritingOutput(sections=results)

