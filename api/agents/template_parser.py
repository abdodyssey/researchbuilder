"""
Template Parser — Ekstrak Constraints dari Template Jurnal
============================================================
Membaca teks template jurnal target (dari file DOCX yang diupload user)
dan mengekstrak aturan-aturan penulisan (JournalConstraints).

Constraints yang diekstrak:
- abstract_max_words: batas kata abstrak (default 250)
- abstract_format: format abstrak (e.g. "satu paragraf tanpa sitasi")
- keywords_min / keywords_max: range jumlah kata kunci
- citation_style: gaya sitasi (APA/IEEE/Harvard/Chicago)
- required_sections: list section wajib di jurnal target
- needs_tables / needs_figures: apakah butuh tabel/gambar
- font / font_size / columns: formatting
- language: bahasa utama ("id" / "en")
- additional_notes: catatan tambahan

Digunakan oleh orchestrator untuk menginstruksikan agent selanjutnya
(outline, writing, draft_adapter, review) agar mengikuti format jurnal.
"""

from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import JournalConstraints
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("academic target journal template constraints parser")

@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(template_text: str) -> JournalConstraints:
    """
    Parse template jurnal dan kembalikan JournalConstraints.

    Args:
        template_text: Teks lengkap template jurnal (biasanya dari DOCX)

    Returns:
        JournalConstraints: objek Pydantic berisi semua aturan format jurnal
    """
    user_msg = f"""
Kamu adalah parser template jurnal akademik.
Baca teks template jurnal berikut dan ekstrak constraints penulisan.
Return HANYA JSON valid dengan struktur JournalConstraints.
Jika informasi tidak ditemukan, gunakan nilai default.

Template:
{template_text}

JSON Target Structure:
{{
    "abstract_max_words": 250,
    "abstract_format": "satu paragraf tanpa sitasi",
    "keywords_min": 3,
    "keywords_max": 6,
    "citation_style": "APA",
    "required_sections": ["INTRODUCTION", "MATERIALS AND METHODS", "RESULTS AND DISCUSSION", "CONCLUSION"],
    "needs_tables": false,
    "needs_figures": false,
    "figure_as_placeholder": true,
    "columns": 1,
    "font": "Times New Roman",
    "font_size": 12,
    "language": "id",
    "additional_notes": ""
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.1,
        max_tokens=1500,
        agent="template_parser",
    )
    raw = raw.strip()
    data = extract_json(raw)
    return JournalConstraints(**data)
