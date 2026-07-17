"""
Agent 6: Editor Final — Penyempurnaan Artikel Otomatis
=======================================================
Bertindak sebagai editor senior jurnal akademis yang menyempurnakan
draft artikel secara otomatis. User tidak melihat skor atau catatan —
mereka hanya menerima artikel yang sudah dipoles.

Tugas agent ini:
1. Membaca seluruh draft artikel
2. Menulis abstrak final yang substantif dan akurat (min. 150 kata)
3. Menentukan keywords final (5-8 kata kunci)
4. Memberikan satu kalimat ringkasan internal (disimpan di backend, tidak ditampilkan ke user)

TIDAK lagi memberikan skor, issues, atau saran perbaikan ke user.
Jika ada kekurangan dalam draft, agent ini langsung memperbaikinya
di abstrak — bukan melaporkannya.
"""

import json
import re
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import ReviewInput, ReviewOutput
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("senior academic journal editor finalizing article manuscripts")


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: ReviewInput, article_type: str = "literature_review", template_text: str = "", constraints=None) -> ReviewOutput:
    """
    Poles artikel sebagai editor: tulis abstrak final + keywords.
    Tidak ada skor, tidak ada catatan, tidak ada keluhan — langsung sempurnakan.
    """
    draft_text = truncate_to_tokens(inp.full_draft, 10000)

    methodology_constraint = ""
    if article_type == "literature_review":
        methodology_constraint = (
            "- Artikel ini adalah LITERATURE REVIEW. Abstrak WAJIB menyebutkan ini adalah studi tinjauan pustaka. "
            "DILARANG KERAS menyebut survei, kuesioner, atau pengumpulan data lapangan yang tidak ada."
        )
    elif article_type == "conceptual":
        methodology_constraint = (
            "- Artikel ini adalah CONCEPTUAL. Abstrak harus menjelaskan analisis konseptual/teoritis. "
            "DILARANG mengarang pengujian empiris."
        )

    template_instruction = ""
    if template_text:
        template_instruction = f"\n- Sesuaikan gaya dan format abstrak dengan panduan berikut:\n{template_text}"

    user_msg = f"""Kamu adalah editor senior jurnal akademis. Bacalah draft artikel di bawah ini dan sempurnakan.

Topik: "{inp.focused_topic}"
Tipe Artikel: {article_type}
Research questions: {inp.research_questions}

Draft Artikel:
{draft_text}

TUGAS KAMU:
1. Tulis ABSTRAK FINAL yang substantif (minimal 150 kata). Struktur: latar belakang -> tujuan -> metode -> temuan -> kesimpulan.
   Tulis abstrak secara akurat sesuai isi draft. JANGAN mengarang data atau metode yang tidak ada.
   {methodology_constraint}{template_instruction}

2. Tentukan 5-8 KEYWORDS FINAL yang paling representatif untuk artikel ini.

3. Tulis satu kalimat ringkasan internal (bukan untuk user - hanya untuk log sistem).

DILARANG menggunakan bahasa lebay, dramatis, atau klise seperti "menyingkap tabir", "di era modern ini".
Gunakan bahasa akademik yang padat, lugas, dan objektif.

Balas HANYA JSON valid:
{{
  "overall_score": 75,
  "issues": [],
  "abstract": "tulis abstrak final substantif minimal 150 kata di sini...",
  "keywords_final": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "review_summary": "Satu kalimat ringkasan internal untuk log sistem."
}}"""

    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=3000,
        agent="review",
    )

    try:
        data = extract_json(raw)
    except Exception as e:
        print(f"[ERROR] Failed to parse JSON response from Editor Agent: {e}")
        raise

    # Pastikan issues selalu kosong - tidak ditampilkan ke user
    data["issues"] = []
    data["overall_score"] = data.get("overall_score", 75)

    return ReviewOutput(**data)
