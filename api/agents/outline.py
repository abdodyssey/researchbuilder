"""
Agent 4: Outline Generator — Kerangka Artikel IMRAD
====================================================
Membuat outline artikel ilmiah dengan STRUKTUR IMRAD yang dipaksakan.

Section scaffold bersifat hardcoded berdasarkan (article_type, bahasa).
LLM hanya mengisi key_points, word_target, dan references_to_cite.

Scaffold yang tersedia:
  - imrad + literature_review  → Pendahuluan / Metode Pencarian / Temuan & Analisis / Pembahasan / Kesimpulan
  - imrad + empirical          → Pendahuluan / Metode / Hasil / Pembahasan / Kesimpulan
  - imrad + conceptual         → Pendahuluan / Tinjauan Literatur / Kerangka Konseptual / Pembahasan / Kesimpulan
  (bahasa EN: section titles in English)
"""

import json
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import OutlineInput, OutlineOutput
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("academic writing specialist creating structured article outlines")


# ── Scaffold Definitions ──────────────────────────────────────────────────────
# Setiap scaffold mendefinisikan section dengan: id, title, purpose, word_target default
# LLM hanya boleh mengisi key_points dan references_to_cite

def _get_scaffold(article_type: str, bahasa: str) -> list[dict]:
    """
    Kembalikan scaffold baku berdasarkan tipe artikel dan bahasa.
    Ini adalah sumber kebenaran tunggal untuk struktur bab artikel IMRAD.
    """
    lang = bahasa.lower()

    # IMRAD — beda tipe artikel beda terminologi section
    if article_type == "empirical":
        if lang == "id":
            return [
                {"id": "sec_01", "title": "Pendahuluan",
                 "purpose": "Latar belakang masalah, urgensi penelitian, rumusan masalah, tujuan, dan hipotesis.",
                 "word_target": 600},
                {"id": "sec_02", "title": "Metode",
                 "purpose": "Desain penelitian, populasi/sampel, instrumen pengumpulan data, prosedur, dan teknik analisis data.",
                 "word_target": 600},
                {"id": "sec_03", "title": "Hasil",
                 "purpose": "Penyajian data dan temuan secara objektif tanpa interpretasi — tabel, angka, fakta.",
                 "word_target": 800},
                {"id": "sec_04", "title": "Pembahasan",
                 "purpose": "Interpretasi hasil, perbandingan dengan literatur, keterbatasan penelitian, dan implikasi teoritis/praktis.",
                 "word_target": 900},
                {"id": "sec_05", "title": "Kesimpulan",
                 "purpose": "Rangkuman temuan utama, jawaban atas pertanyaan penelitian, dan saran untuk penelitian lanjutan.",
                 "word_target": 350},
            ]
        else:
            return [
                {"id": "sec_01", "title": "Introduction",
                 "purpose": "Background, problem statement, research objectives, and hypotheses.",
                 "word_target": 600},
                {"id": "sec_02", "title": "Methods",
                 "purpose": "Research design, sample, data collection instruments, procedures, and analysis techniques.",
                 "word_target": 600},
                {"id": "sec_03", "title": "Results",
                 "purpose": "Objective presentation of data and findings without interpretation.",
                 "word_target": 800},
                {"id": "sec_04", "title": "Discussion",
                 "purpose": "Interpretation of results, comparison with literature, limitations, and implications.",
                 "word_target": 900},
                {"id": "sec_05", "title": "Conclusion",
                 "purpose": "Summary of key findings, answers to research questions, and recommendations.",
                 "word_target": 350},
            ]

    elif article_type == "conceptual":
        if lang == "id":
            return [
                {"id": "sec_01", "title": "Pendahuluan",
                 "purpose": "Latar belakang, urgensi kajian konseptual, tujuan, dan pertanyaan konseptual.",
                 "word_target": 600},
                {"id": "sec_02", "title": "Tinjauan Literatur",
                 "purpose": "Kajian kritis terhadap teori dan konsep yang relevan dari literatur yang ada.",
                 "word_target": 900},
                {"id": "sec_03", "title": "Kerangka Konseptual",
                 "purpose": "Pengembangan kerangka berpikir dan model konseptual baru berdasarkan sintesis literatur.",
                 "word_target": 800},
                {"id": "sec_04", "title": "Pembahasan",
                 "purpose": "Diskusi implikasi teoretis kerangka konseptual, perbandingan dengan pendekatan lain, dan keterbatasan.",
                 "word_target": 700},
                {"id": "sec_05", "title": "Kesimpulan",
                 "purpose": "Sintesis kontribusi konseptual dan rekomendasi untuk penelitian empiris lanjutan.",
                 "word_target": 350},
            ]
        else:
            return [
                {"id": "sec_01", "title": "Introduction",
                 "purpose": "Background, urgency of conceptual study, and conceptual questions.",
                 "word_target": 600},
                {"id": "sec_02", "title": "Literature Review",
                 "purpose": "Critical review of relevant theories and concepts from existing literature.",
                 "word_target": 900},
                {"id": "sec_03", "title": "Conceptual Framework",
                 "purpose": "Development of a new conceptual model or framework based on literature synthesis.",
                 "word_target": 800},
                {"id": "sec_04", "title": "Discussion",
                 "purpose": "Theoretical implications of the framework, comparison with other approaches, and limitations.",
                 "word_target": 700},
                {"id": "sec_05", "title": "Conclusion",
                 "purpose": "Synthesis of conceptual contributions and recommendations for future empirical research.",
                 "word_target": 350},
            ]

    # Default: IMRAD literature_review
    if lang == "id":
        return [
            {"id": "sec_01", "title": "Pendahuluan",
             "purpose": "Latar belakang isu penelitian, urgensi kajian pustaka, tujuan tinjauan, dan pertanyaan penelitian.",
             "word_target": 600},
            {"id": "sec_02", "title": "Metode Pencarian Literatur",
             "purpose": "Protokol pencarian: database yang digunakan, kata kunci, kriteria inklusi/eksklusi, dan jumlah literatur yang dianalisis.",
             "word_target": 500},
            {"id": "sec_03", "title": "Temuan dan Analisis",
             "purpose": "Penyajian dan sintesis temuan dari literatur yang dikaji secara tematik dan sistematis.",
             "word_target": 1000},
            {"id": "sec_04", "title": "Pembahasan",
             "purpose": "Interpretasi pola temuan, perbandingan antar studi, research gap, dan implikasi bagi penelitian dan praktik.",
             "word_target": 800},
            {"id": "sec_05", "title": "Kesimpulan",
             "purpose": "Rangkuman kontribusi tinjauan literatur, jawaban atas pertanyaan penelitian, dan rekomendasi untuk penelitian selanjutnya.",
             "word_target": 350},
        ]
    else:
        return [
            {"id": "sec_01", "title": "Introduction",
             "purpose": "Background of the research issue, rationale for the literature review, objectives, and research questions.",
             "word_target": 600},
            {"id": "sec_02", "title": "Literature Search Methods",
             "purpose": "Search protocol: databases used, keywords, inclusion/exclusion criteria, and number of articles analyzed.",
             "word_target": 500},
            {"id": "sec_03", "title": "Findings and Analysis",
             "purpose": "Thematic presentation and synthesis of findings from reviewed literature.",
             "word_target": 1000},
            {"id": "sec_04", "title": "Discussion",
             "purpose": "Interpretation of finding patterns, cross-study comparisons, research gaps, and implications.",
             "word_target": 800},
            {"id": "sec_05", "title": "Conclusion",
             "purpose": "Summary of literature review contributions, answers to research questions, and future research recommendations.",
             "word_target": 350},
        ]


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(inp: OutlineInput, template_text: str = "", constraints=None) -> OutlineOutput:
    """
    Generate outline artikel dengan scaffold yang sudah ditentukan.

    LLM TIDAK diizinkan menentukan atau mengganti nama section.
    LLM hanya mengisi: key_points spesifik, word_target (boleh adjust ±20%), references_to_cite.
    """
    scaffold = _get_scaffold(inp.article_type, inp.bahasa)

    # Format scaffold sebagai instruksi yang jelas
    scaffold_text = "\n".join([
        f"  Section {i+1}: \"{sec['title']}\" — Tujuan: {sec['purpose']} (target: ~{sec['word_target']} kata)"
        for i, sec in enumerate(scaffold)
    ])

    ref_list_text = ""
    if hasattr(inp, "references") and inp.references:
        ref_list_text = "\n\nREFERENSI TERSEDIA UNTUK DISITASI:\n" + "\n".join(
            f"  - ID: {r.id} | {r.author} ({r.year}) — {r.title}" for r in inp.references
        )

    template_instruction = ""
    if template_text and template_text != "":
        template_instruction = f"\n\nCATATAN TAMBAHAN: {template_text}"

    user_msg = f"""Kamu adalah akademisi senior yang menyusun kerangka artikel ilmiah.

Topik: "{inp.focused_topic}"
Tipe Artikel: {inp.article_type}
Bahasa Output: {inp.bahasa}
Research Questions: {inp.research_questions}

Temuan Sintesis Literatur:
- Tema Kunci: {inp.key_themes}
- Research Gaps: {inp.research_gaps}
- Ringkasan: {inp.synthesis_summary[:800]}
{ref_list_text}{template_instruction}

INSTRUKSI PENTING:
Artikel ini WAJIB menggunakan struktur bab berikut (JANGAN ubah nama section):

{scaffold_text}

TUGASMU untuk setiap section di atas:
1. Tentukan 3-5 "key_points" yang spesifik dan substantif sesuai topik (bukan generik)
2. Sesuaikan "word_target" (boleh ±20% dari target) berdasarkan kedalaman bahasan
3. Pilih referensi relevan dari daftar referensi di atas untuk "references_to_cite"

Buat juga judul artikel yang definitif dan academic (bukan clickbait).

Return JSON (JANGAN ubah id, title, dan purpose dari scaffold di atas):
{{
  "title": "Judul artikel yang definitif",
  "abstract_hint": "Petunjuk singkat isi abstrak",
  "sections": [
    {{
      "id": "sec_01",
      "title": "NAMA SECTION PERSIS SEPERTI DI SCAFFOLD",
      "purpose": "TUJUAN PERSIS SEPERTI DI SCAFFOLD",
      "key_points": ["poin spesifik 1", "poin spesifik 2", "poin spesifik 3"],
      "word_target": 600,
      "references_to_cite": ["ref_001", "ref_002"]
    }}
  ],
  "estimated_total_words": 3250
}}"""

    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.25,
        max_tokens=2500,
        agent="outline",
    )
    raw = raw.strip()
    data = extract_json(raw)

    # Enforce scaffold: override title, purpose, id dari scaffold
    # LLM mungkin mengubah nama section — kita kembalikan ke scaffold yang benar
    llm_sections = data.get("sections", [])
    enforced_sections = []
    for i, scaffold_sec in enumerate(scaffold):
        if i < len(llm_sections):
            llm_sec = llm_sections[i]
            enforced_sections.append({
                "id": scaffold_sec["id"],
                "title": scaffold_sec["title"],       # Paksa nama dari scaffold
                "purpose": scaffold_sec["purpose"],   # Paksa purpose dari scaffold
                "key_points": llm_sec.get("key_points", [f"Bahasan utama {scaffold_sec['title']}"]),
                "word_target": llm_sec.get("word_target", scaffold_sec["word_target"]),
                "references_to_cite": llm_sec.get("references_to_cite", []),
            })
        else:
            # Section tidak diisi LLM — pakai scaffold default
            enforced_sections.append({
                "id": scaffold_sec["id"],
                "title": scaffold_sec["title"],
                "purpose": scaffold_sec["purpose"],
                "key_points": [f"Bahasan utama {scaffold_sec['title']}"],
                "word_target": scaffold_sec["word_target"],
                "references_to_cite": [],
            })

    data["sections"] = enforced_sections
    data["estimated_total_words"] = sum(s["word_target"] for s in enforced_sections)

    return OutlineOutput(**data)
